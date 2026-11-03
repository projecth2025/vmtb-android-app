import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { PDFDocument } from 'pdf-lib';
import { FileText, Pencil, Plus, StickyNote, Trash2, Upload } from 'lucide-react-native';
import { styles } from '../../../theme/styles';
import { CaseDetail, PickedCaseFile } from '../../../types';
import {
  commitCaseEdits,
  fetchCaseDocumentRows,
  fetchCaseDocumentVersions,
  fetchRemovedDocumentKeys,
  fetchReportFileUrl,
  fetchReportFiles,
  fetchSignedKeys,
  getUploadConfigForExistingRequest,
  mapPipelineError,
  toDocumentName,
  uploadFilesToS3,
} from '../../../lib/api/redaction';
import { ALLOWED_EXTENSIONS, errorMessage, makeUuid } from '../../../lib/api/config';
import { decodeBase64 } from '../../../lib/base64';
import { Button, EmptyCard, ErrorBox, Field, FormModal, Loading, Pill } from '../../../components/ui';
import { DocumentEditor } from './DocumentEditor';
import { DocumentViewer, documentKind, stripReportPrefix } from './DocumentViewer';

const ANONYMIZED_PREFIX = 'ANO_NNCMFAGSSS_22246_';

interface Notes {
  title: string;
  content: string;
}

/** Extracts the server's error code (`CASE_WOULD_BE_EMPTY:<name>` → the code). */
function errorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.split(':')[0];
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return 'Report';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Report';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export function ReportsTab({
  record,
  editable,
  onRefresh,
  snapshotGeneration = null,
}: {
  record: CaseDetail;
  editable: boolean;
  onRefresh?: () => Promise<void> | void;
  /** Documents as they were at the owner's last verified generation (members). */
  snapshotGeneration?: number | null;
}) {
  const snapshotMode = snapshotGeneration != null;

  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [reports, setReports] = useState<{ filename: string; url: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [additional, setAdditional] = useState<Notes | null>(null);

  // Unsaved draft: uploads, removals, notes — committed in ONE transaction.
  const [pendingUploads, setPendingUploads] = useState<PickedCaseFile[]>([]);
  const [pendingDeletes, setPendingDeletes] = useState<string[]>([]);
  const [notesDraft, setNotesDraft] = useState<Notes | null | undefined>(undefined);
  const [committing, setCommitting] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  // Set when the empty-case question is open: walking away from it archives.
  const archiveOnLeaveRef = useRef<string | null>(null);

  // Modals
  const [uploadCandidates, setUploadCandidates] = useState<PickedCaseFile[] | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesTitle, setNotesTitle] = useState('');
  const [notesContent, setNotesContent] = useState('');
  const [emptyPrompt, setEmptyPrompt] = useState(false);
  const [viewer, setViewer] = useState<{ filename: string; url: string } | null>(null);
  const [picking, setPicking] = useState(false);

  const pendingCount = pendingUploads.length + pendingDeletes.length + (notesDraft !== undefined ? 1 : 0);

  // Snapshot mode: document key per listed filename, for re-signing on open.
  const snapshotKeys = useRef<Record<string, string>>({});

  const sessionId = () => {
    if (!sessionIdRef.current) sessionIdRef.current = makeUuid();
    return sessionIdRef.current;
  };

  const resetDraft = () => {
    setPendingUploads([]);
    setPendingDeletes([]);
    setNotesDraft(undefined);
    sessionIdRef.current = null;
  };

  /**
   * The documents exactly as they were at generation `g`: those added at or
   * before it and not yet removed then, each at its latest version published
   * at or before it (versions keep immutable per-version files, so a document
   * redacted or removed afterwards still has the content that was verified).
   */
  const loadSnapshot = async (g: number) => {
    const requestId = record.request_id!;
    const [docs, versions] = await Promise.all([
      fetchCaseDocumentRows(record.id),
      fetchCaseDocumentVersions(record.id),
    ]);
    const entries = new Map<string, string>(); // filename -> s3 key
    const sorted = [...docs].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    for (const doc of sorted) {
      const liveAtG = (doc.added_generation ?? 0) <= g && (doc.deleted_generation == null || doc.deleted_generation > g);
      if (!liveAtG || !doc.document_name) continue;
      const removedSince =
        doc.deleted_generation != null &&
        typeof doc.deleted_s3_key === 'string' &&
        doc.deleted_s3_key.startsWith('uploads/');
      if (String(doc.file_name).toLowerCase().endsWith('.txt')) {
        entries.set(doc.file_name, removedSince ? doc.deleted_s3_key! : `uploads/${requestId}/data/${doc.file_name}`);
        continue;
      }
      const best = versions
        .filter((row) => row.document_name === doc.document_name && (row.generation ?? 0) <= g)
        .sort((a, b) => b.version - a.version)[0];
      if (!best) continue; // not anonymized yet at that point
      const canonical = `uploads/${requestId}/data/${ANONYMIZED_PREFIX}${doc.document_name}.pdf`;
      entries.set(
        `${ANONYMIZED_PREFIX}${doc.document_name}.pdf`,
        best.s3_key === canonical && removedSince ? doc.deleted_s3_key! : best.s3_key,
      );
    }
    const urls = await fetchSignedKeys(requestId, [...entries.values()]);
    snapshotKeys.current = Object.fromEntries(entries);
    setReports([...entries].filter(([, key]) => urls[key]).map(([filename, key]) => ({ filename, url: urls[key] })));
  };

  const load = useCallback(async () => {
    if (!record.request_id) {
      setReports([]);
      setLoading(false);
      return;
    }
    try {
      if (snapshotMode) {
        await loadSnapshot(snapshotGeneration!);
        const notes = record.verified_snapshot?.notes;
        setAdditional(notes?.content ? { title: notes.title ?? 'Additional Data', content: notes.content } : null);
      } else {
        const [files, removed] = await Promise.all([
          fetchReportFiles(record.request_id),
          fetchRemovedDocumentKeys(record.id),
        ]);
        // A name removed and later re-added (same file name) is live again.
        setReports(files.filter((file) => !removed.has(toDocumentName(file.filename))));
        setAdditional(
          record.extra?.length
            ? { title: record.extra[0].document_title, content: record.extra[0].document_data }
            : null,
        );
      }
      setError('');
    } catch (e) {
      console.error('Error fetching reports:', e);
      setError("Reports couldn't be loaded. Try again in a moment.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id, record.request_id, record.extra, snapshotGeneration, snapshotMode]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  // Signed URLs expire after ~15 minutes and this tab stays mounted for a
  // whole visit, so the listing is re-fetched before that.
  useEffect(() => {
    const timer = setInterval(() => { if (!snapshotMode) void load(); }, 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, [load, snapshotMode]);

  // ============================================================
  // Opening documents
  // ============================================================

  const shareReport = async (filename: string) => {
    const url = await fetchReportFileUrl(record.request_id!, filename);
    const localFile = new File(Paths.cache, filename.replace(/[^a-zA-Z0-9._-]/g, '_'));
    await File.downloadFileAsync(url, localFile);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(localFile.uri, { dialogTitle: filename, mimeType: 'application/pdf' });
    } else {
      await Linking.openURL(url);
    }
  };

  const openReport = async (filename: string) => {
    try {
      if (snapshotMode) {
        const key = snapshotKeys.current[filename];
        if (!key) throw new Error('This version of the document is no longer available.');
        const urls = await fetchSignedKeys(record.request_id!, [key]);
        const url = urls[key];
        if (!url) throw new Error('This version of the document is no longer available.');
        setViewer({ filename, url });
        return;
      }
      const kind = documentKind(filename);
      if (kind === 'other') {
        await shareReport(filename);
        return;
      }
      const url = await fetchReportFileUrl(record.request_id!, filename);
      setViewer({ filename, url });
    } catch (e) {
      setError(errorMessage(e, 'Could not open the report.'));
    }
  };

  // ============================================================
  // Adding / removing documents and notes (owner draft)
  // ============================================================

  const pickDocuments = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
        type: [
          'image/*',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'text/plain',
        ],
      });
      if (result.canceled) return;
      const additions: PickedCaseFile[] = result.assets.map((asset) => ({
        name: asset.name,
        uri: asset.uri,
        size: asset.size ?? 0,
        mimeType: asset.mimeType ?? 'application/octet-stream',
      }));

      const rejected: string[] = [];
      const blocked: string[] = [];
      const taken = new Set([
        ...reports.map((report) => stripReportPrefix(report.filename)),
        ...pendingUploads.map((file) => file.name),
      ]);
      const valid: PickedCaseFile[] = [];

      for (const file of additions) {
        const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
        if (!ALLOWED_EXTENSIONS.has(extension)) {
          rejected.push(`${file.name} (allowed types: ${[...ALLOWED_EXTENSIONS].join(', ')})`);
          continue;
        }
        if (taken.has(file.name)) {
          rejected.push(`${file.name} (a document with this name already exists)`);
          continue;
        }
        if (extension === 'pdf') {
          try {
            const encoded = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
            const pdf = await PDFDocument.load(decodeBase64(encoded), { ignoreEncryption: true });
            if (pdf.getPageCount() > 50) {
              blocked.push(`"${file.name}" (${pdf.getPageCount()} pages)`);
              continue;
            }
          } catch (err) {
            console.warn('Could not validate PDF page count for:', file.name, err);
          }
        }
        taken.add(file.name);
        valid.push(file);
      }

      if (blocked.length) {
        Alert.alert('PDF too long', `PDFs can have at most 50 pages: ${blocked.join(', ')}`);
      }
      if (rejected.length) {
        Alert.alert('Not added', `Not added: ${rejected.join(', ')}.`);
      }
      if (valid.length) setUploadCandidates(valid);
    } catch (e) {
      setError(errorMessage(e, 'Could not open your files.'));
    } finally {
      setPicking(false);
    }
  };

  const confirmUploads = () => {
    if (uploadCandidates?.length) setPendingUploads((previous) => [...previous, ...uploadCandidates]);
    setUploadCandidates(null);
  };

  const removeDocument = (filename: string) =>
    Alert.alert(
      'Remove document?',
      `${stripReportPrefix(filename)} will be removed from this case. Its members will no longer see it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => setPendingDeletes((previous) => [...previous, filename]),
        },
      ],
    );

  const keepDocument = (filename: string) =>
    setPendingDeletes((previous) => previous.filter((name) => name !== filename));

  const openNotes = () => {
    const current = notesDraft !== undefined ? notesDraft : additional;
    setNotesTitle(current?.title ?? 'Additional Data');
    setNotesContent(current?.content ?? '');
    setNotesOpen(true);
  };

  const stageNotes = () => {
    const next = { title: notesTitle.trim() || 'Additional Data', content: notesContent };
    // Unchanged from what's saved: nothing to save (and no re-verification).
    if (additional && additional.title === next.title && additional.content === next.content) {
      setNotesDraft(undefined);
    } else {
      setNotesDraft(next);
    }
    setNotesOpen(false);
  };

  // ============================================================
  // Saving
  // ============================================================

  const save = async (options?: { emptyAction?: 'archive' }) => {
    if (committing || !record.request_id) return;
    const uploads = pendingUploads;
    const deletes = pendingDeletes;
    const notes = notesDraft;
    if (!uploads.length && !deletes.length && notes === undefined) return;

    setCommitting(true);
    setError('');
    try {
      if (uploads.length) {
        // Same keys every attempt, so a retried save just overwrites them.
        const config = await getUploadConfigForExistingRequest(record.request_id);
        await uploadFilesToS3(uploads, config);
      }
      const run = await commitCaseEdits({
        caseId: record.id,
        sessionId: sessionId(),
        uploadFiles: uploads.map((file) => ({
          file_name: file.name,
          size: String(file.size),
          type: file.mimeType || '',
        })),
        deleteFiles: deletes,
        additionalData: notes === undefined ? undefined : notes,
        emptyAction: options?.emptyAction ?? null,
      });
      resetDraft();
      setEmptyPrompt(false);
      if (run.archived) {
        Alert.alert(
          'Changes saved',
          'The case had no documents or notes left, so it was archived. You can restore it from Archived cases.',
        );
      } else if (run.duplicate) {
        Alert.alert('These changes were already saved.');
      } else {
        Alert.alert('Changes saved', 'The summary will be regenerated and will need your verification.');
      }
      await onRefresh?.();
      await load();
    } catch (e) {
      const code = errorCode(e);
      if (code === 'NOTHING_TO_SAVE') {
        resetDraft();
        setEmptyPrompt(false);
        Alert.alert('These changes were already saved.');
      } else if (code === 'CASE_WOULD_BE_EMPTY') {
        // Nothing saved yet: ask what to do (add data, or archive). Walking
        // away from that question archives, so remember this session.
        archiveOnLeaveRef.current = sessionIdRef.current;
        setEmptyPrompt(true);
      } else {
        setError(mapPipelineError(e, "Your changes couldn't be saved."));
      }
    } finally {
      setCommitting(false);
    }
  };

  const discard = () => {
    resetDraft();
    setEmptyPrompt(false);
  };

  // Leaving the case with the empty-case question open archives it (web
  // parity: closing the tab or walking away from the decision archives).
  const emptyPromptRef = useRef(false);
  emptyPromptRef.current = emptyPrompt;
  const pendingDeletesRef = useRef(pendingDeletes);
  pendingDeletesRef.current = pendingDeletes;
  const committingRef = useRef(false);
  committingRef.current = committing;
  useEffect(() => {
    return () => {
      if (!emptyPromptRef.current || committingRef.current || !archiveOnLeaveRef.current) return;
      void commitCaseEdits({
        caseId: record.id,
        sessionId: archiveOnLeaveRef.current,
        deleteFiles: pendingDeletesRef.current,
        emptyAction: 'archive',
      }).catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================================
  // Render
  // ============================================================

  const isProcessing = record.report_status === 'not_ready';
  const hasReports = reports.length > 0;
  const showBlockingProcessing = isProcessing && !hasReports && !loading;

  const statusLine = (filename: string) => {
    if (pendingUploads.some((file) => file.name === filename)) {
      return { text: 'Added, not uploaded yet', color: '#b45309' };
    }
    if (pendingDeletes.includes(filename)) return { text: 'Will be removed', color: '#b91c1c' };
    return { text: formatDate(record.created_at), color: '#9ca3af' };
  };

  const owner = editable && !snapshotMode;

  // Staged uploads are shown alongside the saved documents, so a draft can be
  // reviewed and undone before it is committed.
  const listed = [
    ...pendingUploads.map((file) => ({ filename: file.name, staged: true })),
    ...reports.map((report) => ({ filename: report.filename, staged: false })),
  ];

  if (mode === 'edit') {
    return (
      <View>
        <View style={styles.rowBetween}>
          <Pill label="edit redactions" active />
          <Pressable onPress={() => setMode('view')}>
            <Text style={styles.link}>Back to viewing</Text>
          </Pressable>
        </View>
        <DocumentEditor record={record} editable={editable} onCommitted={onRefresh} />
      </View>
    );
  }

  return (
    <View>
      {/* Header */}
      <View style={styles.rowBetween}>
        <View style={styles.row}>
          <Text style={styles.sectionTitle}>All Reports</Text>
          {isProcessing && hasReports ? <Pill label="Reprocessing documents…" active /> : null}
        </View>
        {owner && (
          <Pressable onPress={() => void pickDocuments()} disabled={committing || picking} style={styles.row}>
            <Upload size={16} color="#2f6fc4" />
            <Text style={styles.link}>Add documents</Text>
          </Pressable>
        )}
      </View>

      {owner && (
        <View style={styles.row}>
          <Pressable onPress={() => setMode('edit')} style={styles.row}>
            <Pencil size={16} color="#2f6fc4" />
            <Text style={styles.link}>Edit redactions</Text>
          </Pressable>
        </View>
      )}

      {error ? <ErrorBox message={error} /> : null}

      {showBlockingProcessing ? (
        <View style={styles.statusBox}>
          <Text style={styles.bodyText}>
            Documents are being anonymized. They'll appear here shortly.
          </Text>
        </View>
      ) : loading ? (
        <Loading label="Loading reports…" />
      ) : (
        <View>
          {/* "Your data" notes card */}
          {(additional || owner) && (
            <Pressable
              onPress={() => {
                if (owner) openNotes();
                else if (additional) setNotesOpen(true);
              }}
              style={styles.fileRow}
            >
              <StickyNote size={19} color="#16a34a" />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={styles.fileName}>
                  {additional?.title ?? 'Add your data'}
                </Text>
                <Text style={[styles.muted, { color: notesDraft !== undefined ? '#b45309' : '#9ca3af' }]}>
                  {notesDraft !== undefined
                    ? 'Edited, not saved yet'
                    : additional
                      ? 'Your data'
                      : 'Add notes for this case'}
                </Text>
              </View>
              <Plus size={16} color="#9ca3af" />
            </Pressable>
          )}

          {listed.length ? (
            listed.map((item) => {
              const staged = item.staged;
              const deleted = !staged && pendingDeletes.includes(item.filename);
              const status = staged
                ? { text: 'Added, not uploaded yet', color: '#b45309' }
                : statusLine(item.filename);
              return (
                <View
                  key={item.filename}
                  style={[
                    styles.fileRow,
                    deleted && { borderColor: '#fecaca', borderStyle: 'dashed', backgroundColor: '#fef2f2' },
                  ]}
                >
                  <Pressable
                    onPress={() => { if (!staged) void openReport(item.filename); }}
                    style={[styles.row, { flex: 1 }]}
                    accessibilityRole="button"
                  >
                    <FileText size={19} color="#4A90E2" />
                    <View style={{ flex: 1 }}>
                      <Text
                        numberOfLines={1}
                        style={[styles.fileName, deleted && { textDecorationLine: 'line-through', color: '#b91c1c' }]}
                      >
                        {stripReportPrefix(item.filename)}
                      </Text>
                      <Text style={[styles.muted, { color: status.color }]}>{status.text}</Text>
                    </View>
                  </Pressable>
                  {owner && staged && (
                    <Pressable
                      onPress={() => setPendingUploads((previous) => previous.filter((file) => file.name !== item.filename))}
                      accessibilityLabel={`Don't add ${item.filename}`}
                    >
                      <Text style={styles.link}>✕</Text>
                    </Pressable>
                  )}
                  {owner && deleted && (
                    <Pressable onPress={() => keepDocument(item.filename)} accessibilityLabel="Keep document">
                      <Text style={styles.link}>Keep</Text>
                    </Pressable>
                  )}
                  {owner && !staged && !deleted && (
                    <Pressable onPress={() => removeDocument(item.filename)} accessibilityLabel="Remove document">
                      <Trash2 size={16} color="#b91c1c" />
                    </Pressable>
                  )}
                </View>
              );
            })
          ) : !owner && !additional ? (
            <EmptyCard title="No reports available for this case." body="Documents generated for this case will appear here." />
          ) : null}

          {pendingCount > 0 && owner && (
            <View style={styles.row}>
              <Button
                title={committing ? 'Saving…' : `Save changes (${pendingCount})`}
                onPress={() => void save()}
                busy={committing}
                disabled={committing}
              />
              <Button title="Discard" secondary onPress={discard} disabled={committing} />
            </View>
          )}
        </View>
      )}

      {/* Add documents confirm */}
      <FormModal
        visible={uploadCandidates !== null}
        title="Add documents"
        onClose={() => !committing && setUploadCandidates(null)}
      >
        {(uploadCandidates ?? []).map((file) => (
          <View key={file.uri} style={styles.row}>
            <FileText size={16} color="#9ca3af" />
            <Text numberOfLines={1} style={[styles.fileName, { flex: 1 }]}>
              {file.name}
            </Text>
            <Text style={styles.muted}>{(file.size / (1024 * 1024)).toFixed(2)} MB</Text>
          </View>
        ))}
        <Text style={styles.muted}>They'll be uploaded and processed when you save your changes.</Text>
        <View style={styles.row}>
          <Button title="Cancel" secondary onPress={() => setUploadCandidates(null)} />
          <Button
            title={
              uploadCandidates?.length === 1
                ? 'Add document'
                : `Add ${uploadCandidates?.length ?? 0} documents`
            }
            onPress={confirmUploads}
          />
        </View>
      </FormModal>

      {/* Your data */}
      <FormModal
        visible={notesOpen}
        title={
          owner
            ? additional || notesDraft !== undefined
              ? 'Edit your data'
              : 'Add your data'
            : additional?.title || 'Your data'
        }
        onClose={() => setNotesOpen(false)}
      >
        {owner ? (
          <View>
            <Field label="Title" value={notesTitle} onChangeText={setNotesTitle} />
            <Field label="Content" value={notesContent} onChangeText={setNotesContent} multiline />
            <View style={styles.row}>
              <Button title="Cancel" secondary onPress={() => setNotesOpen(false)} />
              <Button title="Save" onPress={stageNotes} />
            </View>
          </View>
        ) : (
          <Text style={styles.bodyText}>{additional?.content}</Text>
        )}
      </FormModal>

      {/* Empty case decision */}
      <FormModal
        visible={emptyPrompt}
        title="This case would have no documents or notes"
        onClose={() => {
          // Closing the question archives, as agreed on the web.
          void save({ emptyAction: 'archive' });
        }}
      >
        <Text style={styles.bodyText}>
          A case needs at least one document or note to summarize. Add something to keep working on it, or archive it.
          If you close this or leave the case, the case is archived.
        </Text>
        <View style={styles.row}>
          <Button
            title="Add documents"
            secondary
            onPress={() => {
              setEmptyPrompt(false);
              void pickDocuments();
            }}
            disabled={committing}
          />
          <Button
            title="Add your data"
            secondary
            onPress={() => {
              setEmptyPrompt(false);
              openNotes();
            }}
            disabled={committing}
          />
        </View>
        <Button
          title={committing ? 'Archiving…' : 'Archive case'}
          onPress={() => void save({ emptyAction: 'archive' })}
          busy={committing}
          disabled={committing}
        />
      </FormModal>

      <DocumentViewer
        visible={viewer !== null}
        filename={viewer?.filename ?? ''}
        url={viewer?.url ?? ''}
        onClose={() => setViewer(null)}
      />
    </View>
  );
}
