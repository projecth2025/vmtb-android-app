import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';
import { FolderOpen, Users } from 'lucide-react-native';
import { styles } from '../../theme/styles';
import { CaseSummary, FeatureScreenProps, MeetingSession } from '../../types';
import {
  addCaseToMtb,
  fetchAvailableCasesForMtb,
  fetchMtbBoard,
  fetchMtbCaseIds,
  fetchMtbSharedCases,
  leaveMtb,
  renameMtb,
  removeCaseFromMtb,
  setMtbNotifications,
} from '../../lib/api/mtbs';
import {
  fetchMeetingSessions,
  fetchActiveMeeting,
  fetchMeetingTranscripts,
  createMeetingJoinTicket,
  deriveRoomName,
} from '../../lib/api/meetings';
import { errorMessage } from '../../lib/api/config';
import {
  Button,
  CaseCard,
  ErrorBox,
  Field,
  FormModal,
  Loading,
  Page,
  Pill,
  EmptyCard,
} from '../../components/ui';

export function MTBDetailScreen({ mtbId, userId, role, profile, effectiveOwnerId, onBack, onOpenCase, onOpenMeeting, onStartMeeting, onNavigate }: FeatureScreenProps & { mtbId: string }) {
  const [board, setBoard] = useState<any>(null);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [available, setAvailable] = useState<CaseSummary[]>([]);
  const [meetings, setMeetings] = useState<MeetingSession[]>([]);
  const [activeMeeting, setActiveMeeting] = useState<MeetingSession | null>(null);
  const [transcripts, setTranscripts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'cases' | 'meetings'>('cases');
  const [addOpen, setAddOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState('');
  const [notificationBusy, setNotificationBusy] = useState(false);
  const isOwner = board?.owner_id === effectiveOwnerId;

  // Web parity: the meeting button is hidden for SDC, and MTB experts can only
  // join (never start) — their start button is disabled until a meeting exists.
  const meetingButton =
    role === 'site_data_coordinator' ? null : role === 'mtb_expert' ? (
      activeMeeting ? (
        <Button title="Join Meeting" onPress={() => void openMeeting()} />
      ) : (
        <>
          <Button title="Start Meeting" secondary disabled onPress={() => {}} />
          <Text style={styles.muted}>Waiting for someone else to start the meeting.</Text>
        </>
      )
    ) : (
      <Button
        title={activeMeeting ? 'Join Meeting' : 'Start Meeting'}
        secondary={!activeMeeting}
        onPress={() => void openMeeting()}
      />
    );

  const load = useCallback(async () => {
    try {
      const [boardRow, ids, sessionRows, active, transcriptRows] = await Promise.all([
        fetchMtbBoard(mtbId),
        fetchMtbCaseIds(mtbId),
        role === 'site_data_coordinator'
          ? fetchMeetingSessions(mtbId).catch(() => [] as MeetingSession[])
          : fetchMeetingSessions(mtbId),
        fetchActiveMeeting(mtbId).catch(() => null),
        role === 'site_data_coordinator'
          ? Promise.resolve([])
          : fetchMeetingTranscripts(mtbId).catch(() => []),
      ]);
      setBoard(boardRow);
      setName(boardRow.name);
      setMeetings(sessionRows);
      setActiveMeeting(active);
      setTranscripts(transcriptRows);
      setCases((await fetchMtbSharedCases(ids)) as CaseSummary[]);
      if (role !== 'mtb_expert') {
        setAvailable(await fetchAvailableCasesForMtb(userId, role, profile?.linked_clinician_id ?? null, ids));
      }
      setError('');
    } catch (e) {
      setError(errorMessage(e, 'Could not load this MTB.'));
    } finally {
      setLoading(false);
    }
  }, [mtbId, role, userId, profile?.linked_clinician_id]);

  useEffect(() => { void load(); }, [load]);

  // Poll for an active meeting while the detail screen is open (web useActiveMeeting parity).
  useEffect(() => {
    const timer = setInterval(() => {
      void fetchActiveMeeting(mtbId)
        .then(setActiveMeeting)
        .catch(() => {});
    }, 15_000);
    return () => clearInterval(timer);
  }, [mtbId]);

  const removeCase = (caseId: string) =>
    Alert.alert('Remove case?', 'This case will no longer be shared with the MTB.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeCaseFromMtb(mtbId, caseId);
            await load();
          } catch (e) {
            setError(errorMessage(e, 'Could not remove the case.'));
          }
        },
      },
    ]);

  const addCase = async (caseId: string) => {
    setError('');
    try {
      await addCaseToMtb(mtbId, caseId);
      setAddOpen(false);
      await load();
    } catch (e) {
      setError(errorMessage(e, 'Could not add the case.'));
    }
  };

  const rename = async () => {
    try {
      await renameMtb(mtbId, name, effectiveOwnerId ?? '');
      setRenameOpen(false);
      await load();
    } catch (e) {
      setError(errorMessage(e, 'Could not rename the MTB.'));
    }
  };

  const leave = () =>
    Alert.alert('Leave MTB?', 'You will lose access to cases shared only with this board.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await leaveMtb(mtbId, userId);
            onBack();
          } catch (e) {
            setError(errorMessage(e, 'Could not leave the MTB.'));
          }
        },
      },
    ]);

  const setNotifications = async (enabled: boolean) => {
    setNotificationBusy(true);
    try {
      await setMtbNotifications(mtbId, enabled);
      setBoard((current: any) => ({ ...current, notification_enabled: enabled }));
    } catch (e) {
      setError(errorMessage(e, 'Could not update notifications.'));
    } finally {
      setNotificationBusy(false);
    }
  };

  const openMeeting = async () => {
    try {
      const room = deriveRoomName(board.name);
      const ticket = await createMeetingJoinTicket(mtbId, room);
      onStartMeeting?.({ room, ticket, mtbId, mtbName: board.name });
    } catch (e) {
      setError(errorMessage(e, 'Could not start the meeting.'));
    }
  };

  if (loading && !board) {
    return (
      <Page title="MTB" onBack={onBack}>
        <Loading label="Loading MTB…" />
      </Page>
    );
  }

  return (
    <Page title={board?.name ?? 'MTB'} onBack={onBack} action={isOwner ? { label: 'Rename', onPress: () => setRenameOpen(true) } : undefined}>
      {error ? <ErrorBox message={error} /> : null}
      <View style={styles.codeCard}>
        <Text style={styles.muted}>Join code</Text>
        <Text style={styles.codeText}>{board?.join_code}</Text>
        <Text style={styles.muted}>{cases.length} shared cases · {meetings.length} meetings</Text>
      </View>
      <View style={styles.rowBetween}>
        <Text style={styles.bodyText}>WhatsApp notifications</Text>
        <Switch
          value={board?.notification_enabled ?? true}
          disabled={notificationBusy}
          onValueChange={(value) => void setNotifications(value)}
        />
      </View>
      <View style={styles.row}>
        {(['cases', 'meetings'] as const).map((value) => (
          <Pill key={value} label={value} active={tab === value} onPress={() => setTab(value)} />
        ))}
      </View>
      {tab === 'cases' ? (
        <>
          {role !== 'mtb_expert' && <Button title="Add case" onPress={() => setAddOpen(true)} />}
          {cases.length ? (
            cases.map((item) => (
              <CaseCard
                key={item.id}
                item={item}
                onPress={() => onOpenCase(item.id, mtbId)}
                trailing={isOwner ? { label: 'Remove', onPress: () => removeCase(item.id) } : undefined}
              />
            ))
          ) : (
            <EmptyCard
              icon={<FolderOpen size={26} color="#4A90E2" />}
              title="No shared cases"
              body="Verified cases shared with this board will appear here."
            />
          )}
          {meetingButton}
        </>
      ) : (
        <>
          {meetingButton}
          {meetings.length ? (
            meetings.map((item) => {
              const momRow = transcripts.find(
                (row) => row.session_id === item.id || row.meeting_id === item.id,
              );
              const momStatus = momRow?.status ?? momRow?.mom_status ?? null;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    (onOpenMeeting ?? (() => {}))(item.id);
                    onNavigate('meeting-detail');
                  }}
                  style={styles.cardPanel}
                >
                  <View style={styles.rowBetween}>
                    <Text style={styles.cardTitle}>{new Date(item.started_at).toLocaleString()}</Text>
                    <Pill
                      label={momStatus ?? (item.status === 'active' ? 'live' : 'ended')}
                      active={item.status === 'active' || momStatus === 'completed'}
                    />
                  </View>
                  <Text style={styles.muted}>
                    {item.status === 'active' ? 'In progress' : 'Ended'}
                    {item.total_duration_seconds ? ` · ${Math.round(item.total_duration_seconds / 60)} min` : ''}
                    {item.max_participants ? ` · ${item.max_participants} participants` : ''}
                  </Text>
                </Pressable>
              );
            })
          ) : (
            <EmptyCard title="No meetings yet" body="Meeting history and minutes will appear here." />
          )}
        </>
      )}
      {!isOwner && <Button title="Leave MTB" secondary onPress={leave} />}
      <FormModal visible={addOpen} title="Add a verified case" onClose={() => setAddOpen(false)}>
        {available.length ? (
          available.map((item) => <CaseCard key={item.id} item={item} onPress={() => void addCase(item.id)} />)
        ) : (
          <Text style={styles.muted}>No verified cases are available to add.</Text>
        )}
      </FormModal>
      <FormModal visible={renameOpen} title="Rename MTB" onClose={() => setRenameOpen(false)}>
        <Field label="Name" value={name} onChangeText={setName} />
        <Button title="Save name" onPress={() => void rename()} />
      </FormModal>
    </Page>
  );
}
