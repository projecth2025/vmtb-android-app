import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { styles } from '../../../theme/styles';
import { CaseDetail } from '../../../types';
import {
  LocalChange,
  RedactionBBox,
  RedactionRegion,
  RedactionStyle,
  commitCaseEdits,
  fetchOriginalsPageUrls,
  fetchRedactions,
  fetchReportFiles,
  mapPipelineError,
} from '../../../lib/api/redaction';
import { errorMessage } from '../../../lib/api/config';
import { Button, ErrorBox, Loading, Pill } from '../../../components/ui';

const STYLE_LABELS: { style: RedactionStyle; label: string }[] = [
  { style: 'whiteout', label: 'White' },
  { style: 'blackout', label: 'Black' },
  { style: 'blur', label: 'Blur' },
];

function normalizeBBox(x0: number, y0: number, x1: number, y1: number): RedactionBBox {
  return {
    x0: Math.min(x0, x1),
    y0: Math.min(y0, y1),
    x1: Math.max(x0, x1),
    y1: Math.max(y0, y1),
  };
}

function bboxWidth(bbox: RedactionBBox) {
  return bbox.x1 - bbox.x0;
}
function bboxHeight(bbox: RedactionBBox) {
  return bbox.y1 - bbox.y0;
}

export function DocumentEditor({
  record,
  editable,
  onCommitted,
}: {
  record: CaseDetail;
  editable: boolean;
  onCommitted?: () => Promise<void> | void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const [files, setFiles] = useState<{ filename: string }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [pageUrls, setPageUrls] = useState<string[]>([]);
  const [savedRegions, setSavedRegions] = useState<RedactionRegion[]>([]);
  const [staged, setStaged] = useState<LocalChange[]>([]);
  const [style, setStyle] = useState<RedactionStyle>('blackout');
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState('');
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawEnd, setDrawEnd] = useState<{ x: number; y: number } | null>(null);
  const pageLayout = useRef<{ w: number; h: number } | null>(null);
  const [pageIndex, setPageIndex] = useState(0);

  const contentWidth = windowWidth - 32;
  const contentHeight = contentWidth * 1.414;

  const drawStartRef = useRef(drawStart);
  const drawEndRef = useRef(drawEnd);
  const styleRef = useRef(style);
  const pageIndexRef = useRef(pageIndex);
  const editableRef = useRef(editable);
  drawStartRef.current = drawStart;
  drawEndRef.current = drawEnd;
  styleRef.current = style;
  pageIndexRef.current = pageIndex;
  editableRef.current = editable;

  const liveResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        if (!editableRef.current) return;
        const layout = pageLayout.current;
        if (!layout) return;
        const { locationX, locationY } = event.nativeEvent;
        setDrawStart({ x: locationX / layout.w, y: locationY / layout.h });
        setDrawEnd({ x: locationX / layout.w, y: locationY / layout.h });
      },
      onPanResponderMove: (event) => {
        if (!editableRef.current || !drawStartRef.current) return;
        const layout = pageLayout.current;
        if (!layout) return;
        const { locationX, locationY } = event.nativeEvent;
        setDrawEnd({ x: locationX / layout.w, y: locationY / layout.h });
      },
      onPanResponderRelease: () => {
        const start = drawStartRef.current;
        const end = drawEndRef.current;
        if (!editableRef.current || !start || !end) {
          setDrawStart(null);
          setDrawEnd(null);
          return;
        }
        const bbox = normalizeBBox(start.x, start.y, end.x, end.y);
        if (bboxWidth(bbox) < 0.01 || bboxHeight(bbox) < 0.01) {
          setDrawStart(null);
          setDrawEnd(null);
          return;
        }
        const region: RedactionRegion = {
          id: `local-${Date.now()}`,
          page: pageIndexRef.current,
          bbox,
          style: styleRef.current,
          source: 'manual',
        };
        setStaged((previous) => [...previous, { kind: 'add', region }]);
        setDrawStart(null);
        setDrawEnd(null);
      },
    }),
  ).current;

  const refresh = async (documentName: string) => {
    if (!record.request_id) return;
    const [urls, regions] = await Promise.all([
      fetchOriginalsPageUrls(record.request_id, documentName).catch(() => [] as string[]),
      fetchRedactions(record.id, documentName).catch(() => [] as RedactionRegion[]),
    ]);
    setPageUrls(urls);
    setSavedRegions(regions);
  };

  useEffect(() => {
    if (!record.request_id) return;
    let alive = true;
    setLoading(true);
    void fetchReportFiles(record.request_id!)
      .then((reportFiles) => {
        if (!alive) return;
        setFiles(reportFiles.map((file) => ({ filename: file.filename })));
        if (reportFiles[0]) setSelected(reportFiles[0].filename);
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e, 'Could not load the report files.'));
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [record.request_id]);

  useEffect(() => {
    if (!selected) {
      setPageUrls([]);
      setSavedRegions([]);
      return;
    }
    let alive = true;
    setLoading(true);
    void refresh(selected).finally(() => {
      if (alive) {
        setStaged([]);
        setPageIndex(0);
        setLoading(false);
      }
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, record.id]);

  const stagedAdditions = staged
    .filter((change): change is LocalChange & { region: RedactionRegion } => change.kind === 'add' && !!change.region)
    .map((change) => change.region);
  const stagedRemovals = new Set(
    staged.filter((change) => change.kind === 'remove').map((change) => change.redactionId),
  );
  const visibleRegions = [
    ...savedRegions.filter((region) => !stagedRemovals.has(region.id)),
    ...stagedAdditions.filter((region) => region.page === pageIndex),
  ];

  const removeStaged = (regionId: string) => {
    const saved = savedRegions.find((region) => region.id === regionId);
    if (saved) {
      setStaged((previous) => [...previous, { kind: 'remove', redactionId: regionId }]);
    } else {
      setStaged((previous) =>
        previous.filter((change) => !(change.kind === 'add' && change.region?.id === regionId)),
      );
    }
  };

  const undo = () => setStaged((previous) => previous.slice(0, -1));

  const commit = async () => {
    if (!selected || !staged.length) return;
    setCommitting(true);
    setError('');
    try {
      await commitCaseEdits({ caseId: record.id, documentName: selected, changes: staged });
      Alert.alert('Edits committed', 'The document pipeline will regenerate this report.');
      setStaged([]);
      if (onCommitted) await onCommitted();
      await refresh(selected);
    } catch (e) {
      setError(mapPipelineError(e) || errorMessage(e, 'Could not commit edits.'));
    } finally {
      setCommitting(false);
    }
  };

  const previewBBox =
    drawStart && drawEnd ? normalizeBBox(drawStart.x, drawStart.y, drawEnd.x, drawEnd.y) : null;
  const pageUrl = pageUrls[pageIndex] ?? null;
  const originalsUnavailable = !loading && pageUrls.length === 0 && !!selected;

  return (
    <View>
      <Text style={styles.sectionTitle}>Reports</Text>
      {files.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {files.map((file) => (
            <Pill
              key={file.filename}
              label={file.filename}
              active={selected === file.filename}
              onPress={() => setSelected(file.filename)}
            />
          ))}
        </ScrollView>
      )}
      {loading && <Loading label="Loading report…" />}
      {error ? <ErrorBox message={error} /> : null}

      {!loading && originalsUnavailable && (
        <ErrorBox message="Original pages are no longer available (retention expired). Editing is disabled for this document." />
      )}

      {editable && !originalsUnavailable && (
        <>
          <View style={styles.filterRow}>
            {STYLE_LABELS.map((item) => (
              <Pill
                key={item.style}
                label={item.label}
                active={style === item.style}
                onPress={() => setStyle(item.style)}
              />
            ))}
            <Pill
              label={`Undo (${staged.length})`}
              onPress={staged.length ? undo : undefined}
              disabled={!staged.length}
            />
          </View>
          <Text style={styles.muted}>
            Drag on the page to {style === 'blur' ? 'blur' : style === 'whiteout' ? 'white out' : 'black out'} a region.
          </Text>
        </>
      )}

      {pageUrl ? (
        <ScrollView>
          <View
            {...liveResponder.panHandlers}
            onLayout={(event) => {
              pageLayout.current = {
                w: event.nativeEvent.layout.width,
                h: event.nativeEvent.layout.height,
              };
            }}
            style={{
              width: contentWidth,
              height: contentHeight,
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#e5e7eb',
              overflow: 'hidden',
            }}
          >
            <Image
              source={{ uri: pageUrl }}
              style={{ width: contentWidth, height: contentHeight }}
              resizeMode="contain"
            />
            {visibleRegions
              .filter((region) => region.page === pageIndex)
              .map((region) => (
                <View
                  key={region.id}
                  pointerEvents="box-none"
                  style={{
                    position: 'absolute',
                    left: region.bbox.x0 * contentWidth,
                    top: region.bbox.y0 * contentHeight,
                    width: bboxWidth(region.bbox) * contentWidth,
                    height: bboxHeight(region.bbox) * contentHeight,
                    backgroundColor:
                      region.style === 'whiteout'
                        ? '#ffffff'
                        : region.style === 'blackout'
                          ? '#000000'
                          : 'rgba(120,120,120,0.55)',
                    borderWidth: region.id.startsWith('local-') ? 1 : 0,
                    borderColor: '#4A90E2',
                  }}
                />
              ))}
            {previewBBox ? (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: previewBBox.x0 * contentWidth,
                  top: previewBBox.y0 * contentHeight,
                  width: bboxWidth(previewBBox) * contentWidth,
                  height: bboxHeight(previewBBox) * contentHeight,
                  borderWidth: 1,
                  borderColor: '#4A90E2',
                  backgroundColor: 'rgba(74,144,226,0.15)',
                }}
              />
            ) : null}
          </View>
        </ScrollView>
      ) : null}

      {pageUrls.length > 1 && (
        <View style={styles.filterRow}>
          {pageUrls.map((_, index) => (
            <Pill
              key={index}
              label={`Page ${index + 1}`}
              active={pageIndex === index}
              onPress={() => setPageIndex(index)}
            />
          ))}
        </View>
      )}

      {editable && visibleRegions.length > 0 && (
        <>
          <Text style={styles.label}>Redactions on this page</Text>
          {visibleRegions
            .filter((region) => region.page === pageIndex)
            .map((region) => (
              <View key={region.id} style={styles.rowBetween}>
                <Text style={styles.bodyText}>
                  Page {region.page + 1} · {region.style} · {region.source ?? 'manual'}
                </Text>
                <Pressable onPress={() => removeStaged(region.id)}>
                  <Text style={styles.link}>Remove</Text>
                </Pressable>
              </View>
            ))}
        </>
      )}

      {editable && (
        <Button
          title={committing ? 'Committing…' : 'Commit redaction changes'}
          onPress={() => void commit()}
          disabled={committing || !staged.length || originalsUnavailable}
        />
      )}
    </View>
  );
}
