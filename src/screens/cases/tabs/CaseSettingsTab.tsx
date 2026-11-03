import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Archive, ArchiveRestore, Check, Trash2, Users } from 'lucide-react-native';
import { styles } from '../../../theme/styles';
import { CaseDetail, Role } from '../../../types';
import { archiveCase, deleteCaseCascade, restoreCase } from '../../../lib/api/cases';
import {
  addCaseToMtbs,
  fetchCaseSharedMtbs,
  fetchShareableMtbBoards,
  removeCaseFromMtb,
} from '../../../lib/api/mtbs';
import { errorMessage } from '../../../lib/api/config';
import { Button, ErrorBox, Field, FormModal, Loading, Pill } from '../../../components/ui';

type MtbBoard = { id: string; name: string; owner_id: string };

interface CaseSettingsTabProps {
  record: CaseDetail;
  editable: boolean;
  role: Role;
  userId: string;
  effectiveOwnerId: string | null;
  onArchived: () => void;
  onRefresh: () => Promise<void>;
}

export function CaseSettingsTab({
  record,
  editable,
  role,
  userId,
  effectiveOwnerId,
  onArchived,
  onRefresh,
}: CaseSettingsTabProps) {
  const [shared, setShared] = useState<MtbBoard[]>([]);
  const [allBoards, setAllBoards] = useState<MtbBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Add-to-MTBs modal
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  // Delete confirm modal (type "permanently delete")
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [sharedRows, boards] = await Promise.all([
        fetchCaseSharedMtbs(record.id),
        fetchShareableMtbBoards(userId, effectiveOwnerId),
      ]);
      setShared(sharedRows);
      setAllBoards(boards);
      setError('');
    } catch (e) {
      setError(errorMessage(e, 'Could not load sharing settings.'));
    } finally {
      setLoading(false);
    }
  }, [record.id, userId, effectiveOwnerId]);

  useEffect(() => { void load(); }, [load]);

  // Sharing follows the web rule: verified and not archived.
  const shareBlockedReason = record.archived_at
    ? 'Restore the case to share it'
    : record.summary_status !== 'verified'
    ? 'Verify the summary before sharing'
    : null;
  const canShareToMtbs = !shareBlockedReason;
  const addable = allBoards.filter((board) => !shared.some((row) => row.id === board.id));

  const removeShare = (board: MtbBoard) =>
    Alert.alert(
      'Remove from MTB',
      `Remove this case from ${board.name}? Its members will no longer see it. Opinions already posted there are kept if you add it back later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            setError('');
            try {
              await removeCaseFromMtb(board.id, record.id);
              setShared((previous) => previous.filter((row) => row.id !== board.id));
            } catch (e) {
              setError(errorMessage(e, 'Failed to remove the case from this MTB. Please try again.'));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );

  const addMtbs = async () => {
    if (!selected.length || adding) return;
    setAdding(true);
    setError('');
    try {
      await addCaseToMtbs(record.id, selected, role);
      const added = allBoards.filter((board) => selected.includes(board.id));
      setShared((previous) => [...previous, ...added]);
      setAddOpen(false);
      setSelected([]);
    } catch (e) {
      setError(errorMessage(e, 'Could not add the case to the selected MTBs.'));
    } finally {
      setAdding(false);
    }
  };

  const archive = () =>
    Alert.alert(
      'Archive case',
      `This case will move to Archived cases${shared.length > 0 ? ` and be removed from ${shared.length} MTB${shared.length === 1 ? '' : 's'}.` : '.'}${
        shared.length > 0 ? " Restoring it later won't share it again — you'd add it to MTBs yourself." : ''
      }`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            setError('');
            try {
              await archiveCase(record.id);
              onArchived();
            } catch (e) {
              setError(errorMessage(e, 'Could not archive this case.'));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );

  const restore = async () => {
    if (restoring) return;
    setRestoring(true);
    setError('');
    try {
      await restoreCase(record.id);
      await onRefresh();
      Alert.alert('Case restored to My Cases');
    } catch (e) {
      setError(errorMessage(e, 'Failed to restore the case. Please try again.'));
    } finally {
      setRestoring(false);
    }
  };

  const deleteCase = async () => {
    if (deleting) return;
    setDeleting(true);
    setError('');
    try {
      await deleteCaseCascade(record.id);
      onArchived();
    } catch (e) {
      setError(errorMessage(e, 'Could not delete this case.'));
      setDeleting(false);
    }
  };

  if (!editable) {
    return (
      <View>
        <Text style={styles.sectionTitle}>Case Settings</Text>
        <Text style={styles.muted}>No settings available. Only the case owner can manage case settings.</Text>
        {error ? <ErrorBox message={error} /> : null}
      </View>
    );
  }

  if (loading) return <Loading label="Loading settings…" />;

  return (
    <View>
      {/* MTB sharing: every MTB the case is in, each removable, plus add to more */}
      <View style={styles.cardPanel}>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={styles.cardTitle}>MTB sharing</Text>
            <Text style={styles.muted}>
              {shared.length > 0
                ? `Shared with ${shared.length} MTB${shared.length === 1 ? '' : 's'}. Members can view and discuss this case.`
                : 'Not shared with any MTB yet.'}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Button
              title="Add to MTBs"
              onPress={() => {
                setSelected([]);
                setAddOpen(true);
              }}
              disabled={!canShareToMtbs || busy}
            />
            {shareBlockedReason ? <Text style={styles.muted}>{shareBlockedReason}</Text> : null}
          </View>
        </View>

        {shared.length > 0 && (
          <View style={{ marginTop: 8 }}>
            {shared.map((board) => {
              const isOwnerBoard = !!board.owner_id && board.owner_id === effectiveOwnerId;
              return (
                <View key={board.id} style={styles.rowBetween}>
                  <View style={styles.row}>
                    <Users size={16} color="#9ca3af" />
                    <Text style={styles.bodyText}>{board.name}</Text>
                    <Pill label={isOwnerBoard ? 'Owner' : 'Member'} active={isOwnerBoard} />
                  </View>
                  <Pressable onPress={() => removeShare(board)} disabled={busy} accessibilityRole="button">
                    <Text style={styles.link}>Remove</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Archive / restore */}
      <View style={styles.cardPanel}>
        <Text style={styles.cardTitle}>{record.archived_at ? 'Restore case' : 'Archive case'}</Text>
        <Text style={styles.muted}>
          {record.archived_at
            ? 'Move this case back to My Cases. It stays unshared until you add it to MTBs again.'
            : 'Hide this case from My Cases and remove it from all MTBs. You can restore it anytime from Archived cases.'}
        </Text>
        {record.archived_at ? (
          <View style={styles.row}>
            <ArchiveRestore size={16} color="#4A5565" />
            <Button
              title={restoring ? 'Restoring…' : 'Restore'}
              secondary
              onPress={() => void restore()}
              disabled={restoring}
            />
          </View>
        ) : (
          <View style={styles.row}>
            <Archive size={16} color="#4A5565" />
            <Button title="Archive case" secondary onPress={archive} disabled={busy} />
          </View>
        )}
      </View>

      {/* Danger zone: deleting is irreversible, so it belongs to the clinician
          alone (server-enforced by trg_cases_delete_role for SDCs). */}
      {role !== 'site_data_coordinator' && (
        <View style={styles.cardPanel}>
          <View style={styles.row}>
            <Trash2 size={16} color="#b91c1c" />
            <Text style={[styles.cardTitle, { color: '#b91c1c' }]}>Danger zone</Text>
          </View>
          <Text style={styles.muted}>
            Permanently delete this case and all its documents, opinions and questions. This can't be undone.
          </Text>
          <Button
            title="Delete case"
            danger
            onPress={() => {
              setDeleteText('');
              setDeleteOpen(true);
            }}
            disabled={busy || deleting}
          />
        </View>
      )}

      {error ? <ErrorBox message={error} /> : null}

      <FormModal visible={addOpen} title="Add to MTBs" onClose={() => !adding && setAddOpen(false)}>
        {addable.length === 0 ? (
          <View>
            <Text style={styles.bodyText}>
              {allBoards.length === 0 ? "You're not part of any MTB yet" : 'Already shared with all your MTBs'}
            </Text>
            <Text style={styles.muted}>
              {allBoards.length === 0
                ? 'Create or join an MTB from the MTBs page first.'
                : 'Every MTB you belong to already has this case.'}
            </Text>
          </View>
        ) : (
          <View>
            <View style={styles.rowBetween}>
              <Text style={styles.muted}>Select the MTBs to share this case with.</Text>
              <Pressable
                onPress={() =>
                  setSelected(selected.length === addable.length ? [] : addable.map((board) => board.id))
                }
                disabled={adding}
              >
                <Text style={styles.link}>
                  {selected.length === addable.length ? 'Clear all' : 'Select all'}
                </Text>
              </Pressable>
            </View>
            {addable.map((board) => {
              const checked = selected.includes(board.id);
              const isOwnerBoard = !!board.owner_id && board.owner_id === effectiveOwnerId;
              return (
                <Pressable
                  key={board.id}
                  onPress={() =>
                    setSelected((previous) =>
                      previous.includes(board.id)
                        ? previous.filter((id) => id !== board.id)
                        : [...previous, board.id],
                    )
                  }
                  disabled={adding}
                  style={styles.rowBetween}
                >
                  <View style={styles.row}>
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 4,
                        borderWidth: 1,
                        borderColor: checked ? '#4A90E2' : '#d1d5db',
                        backgroundColor: checked ? '#4A90E2' : '#fff',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {checked ? <Check size={14} color="#fff" /> : null}
                    </View>
                    <View>
                      <Text style={styles.bodyText}>{board.name}</Text>
                      <Text style={styles.muted}>{isOwnerBoard ? 'Owner' : 'Member'}</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
            <Text style={styles.muted}>Members of the selected MTBs will be notified.</Text>
            <View style={styles.row}>
              <Button title="Cancel" secondary onPress={() => setAddOpen(false)} disabled={adding} />
              <Button
                title={
                  adding
                    ? 'Adding…'
                    : selected.length > 0
                    ? `Add to ${selected.length} MTB${selected.length === 1 ? '' : 's'}`
                    : 'Add to MTBs'
                }
                onPress={() => void addMtbs()}
                disabled={adding || selected.length === 0}
                busy={adding}
              />
            </View>
          </View>
        )}
      </FormModal>

      <FormModal visible={deleteOpen} title="Delete Case" onClose={() => !deleting && setDeleteOpen(false)}>
        <Text style={styles.bodyText}>
          This case will be permanently deleted and cannot be recovered. All associated documents, opinions, and
          questions will also be removed.
        </Text>
        <Field
          label="Type permanently delete to confirm"
          value={deleteText}
          onChangeText={setDeleteText}
          editable={!deleting}
          autoCapitalize="none"
          placeholder="permanently delete"
        />
        <View style={styles.row}>
          <Button title="Cancel" secondary onPress={() => setDeleteOpen(false)} disabled={deleting} />
          <Button
            title={deleting ? 'Deleting…' : 'Delete Case'}
            danger
            busy={deleting}
            onPress={() => void deleteCase()}
            disabled={deleteText.trim().toLowerCase() !== 'permanently delete'}
          />
        </View>
      </FormModal>
    </View>
  );
}
