import { useEffect, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { styles } from '../../../theme/styles';
import { CaseDetail, Role } from '../../../types';
import { archiveCase, deleteCaseCascade } from '../../../lib/api/cases';
import { addCaseToMtb, fetchCaseMtbIdsLocal, fetchOwnedMtbBoards, removeCaseFromMtb } from '../../../lib/api/mtbs';
import { errorMessage } from '../../../lib/api/config';
import { Button, ErrorBox } from '../../../components/ui';

// Local helper re-exports keep the tab self-contained.
async function fetchCaseMtbIds(caseId: string) {
  return fetchCaseMtbIdsLocal(caseId);
}

interface CaseSettingsTabProps {
  record: CaseDetail;
  editable: boolean;
  role: Role;
  effectiveOwnerId: string | null;
  onArchived: () => void;
}

export function CaseSettingsTab({ record, editable, role, effectiveOwnerId, onArchived }: CaseSettingsTabProps) {
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);
  const [shared, setShared] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const mtbIds = await fetchCaseMtbIds(record.id);
        const rows = await fetchOwnedMtbBoards(effectiveOwnerId);
        if (alive) {
          setShared(mtbIds);
          setBoards(rows);
        }
      } catch (e) {
        if (alive) setError(errorMessage(e, 'Could not load sharing settings.'));
      }
    })();
    return () => { alive = false; };
  }, [record.id, effectiveOwnerId]);

  const toggleShare = async (mtbId: string, enabled: boolean) => {
    setBusy(true);
    setError('');
    try {
      if (enabled) await addCaseToMtb(mtbId, record.id);
      else await removeCaseFromMtb(mtbId, record.id);
      setShared((previous) => (enabled ? [...previous, mtbId] : previous.filter((id) => id !== mtbId)));
    } catch (e) {
      setError(errorMessage(e, 'Could not update sharing.'));
    } finally {
      setBusy(false);
    }
  };

  const archive = () =>
    Alert.alert('Archive case?', 'This removes the case from all MTBs. You can restore it later.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: async () => {
          try {
            await archiveCase(record.id);
            onArchived();
          } catch (e) {
            setError(errorMessage(e, 'Could not archive this case.'));
          }
        },
      },
    ]);

  const remove = () =>
    Alert.alert(
      'Permanently delete case?',
      'This removes the case and its related records. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await deleteCaseCascade(record.id);
              onArchived();
            } catch (e) {
              setError(errorMessage(e, 'Could not delete this case.'));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );

  return (
    <View>
      <Text style={styles.sectionTitle}>Share with MTBs</Text>
      {boards.map((board) => (
        <View key={board.id} style={styles.rowBetween}>
          <Text style={styles.bodyText}>{board.name}</Text>
          <Switch
            value={shared.includes(board.id)}
            onValueChange={(value) => void toggleShare(board.id, value)}
            disabled={!editable || busy || role === 'mtb_expert'}
          />
        </View>
      ))}
      {record.archived_at ? <Text style={styles.muted}>This case is archived.</Text> : null}
      {editable && !record.archived_at && <Button title="Archive case" secondary onPress={archive} />}
      {role === 'clinician' && editable && (
        <Button title="Delete case permanently" danger onPress={remove} disabled={busy} />
      )}
      {error ? <ErrorBox message={error} /> : null}
    </View>
  );
}
