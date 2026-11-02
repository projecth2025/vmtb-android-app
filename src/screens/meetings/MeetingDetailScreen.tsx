import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { styles } from '../../theme/styles';
import { FeatureScreenProps } from '../../types';
import {
  fetchMeetingTranscriptSegments,
  fetchMeetingTranscriptForSession,
} from '../../lib/api/meetings';
import { errorMessage } from '../../lib/api/config';
import { ErrorBox, Loading, Page, Pill } from '../../components/ui';

export function MeetingDetailScreen({ meetingId, activeMtbId, onBack }: FeatureScreenProps & { meetingId: string }) {
  const [transcript, setTranscript] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      if (!activeMtbId) throw new Error('Could not identify the MTB for this meeting. Go back and reopen it.');
      // History navigation uses meeting_sessions.id. Transcript meeting_id is
      // the separate Jitsi conference UUID, so resolve via RPC session_id.
      const summary = await fetchMeetingTranscriptForSession(activeMtbId, meetingId);
      // MoM rendering must not depend on optional transcript segments. Segment
      // RLS/schema issues should not turn an otherwise readable MoM into a
      // full-screen meeting load error.
      const segments = summary?.meeting_id
        ? await fetchMeetingTranscriptSegments(summary.meeting_id).catch((segmentError) => {
            console.warn('[meeting-detail] Could not load transcript segments:', segmentError);
            return [];
          })
        : [];
      setTranscript(summary ? { ...summary, segments } : null);
      setError('');
    } catch (e) {
      setError(errorMessage(e, 'Could not load this meeting.'));
    } finally {
      setLoading(false);
    }
  }, [meetingId, activeMtbId]);

  useEffect(() => { void load(); }, [load]);

  // Poll while minutes are pending/processing (web parity).
  useEffect(() => {
    const status = transcript?.status?.toLowerCase();
    if (status !== 'pending' && status !== 'processing' && transcript) return;
    const timer = setInterval(() => void load(), 15_000);
    return () => clearInterval(timer);
  }, [transcript?.status, transcript, load]);

  const momData = transcript?.mom && typeof transcript.mom === 'object' ? transcript.mom : null;
  const decisions: string[] = transcript?.decisions ?? momData?.decisions ?? [];
  const actionItems: { owner?: string; task?: string }[] =
    transcript?.action_items ?? momData?.action_items ?? [];
  const discussionPoints: string[] =
    transcript?.discussion_points ?? momData?.discussion_points ?? [];
  const mom =
    transcript?.minutes_of_meeting ||
    transcript?.mom_text ||
    (typeof transcript?.mom === 'string' ? transcript.mom : momData?.summary ?? null);
  const momStatus = transcript?.status?.toLowerCase() ?? 'pending';

  return (
    <Page title="Meeting" onBack={onBack}>
      {error ? <ErrorBox message={error} /> : null}
      {loading ? (
        <Loading label="Loading meeting…" />
      ) : (
        <>
          <View style={styles.codeCard}>
            <Text style={styles.label}>Minutes of Meeting</Text>
          <Pill label={transcript?.status ?? 'pending'} active={momStatus === 'completed' || !!mom} />
          </View>
          {mom ? (
            <Text style={styles.bodyText}>{mom}</Text>
          ) : (
            <Text style={styles.muted}>
              {!transcript || momStatus === 'pending' || momStatus === 'processing'
                ? 'Minutes are still being generated. This screen refreshes automatically.'
                : 'Minutes of Meeting are not available for this session.'}
            </Text>
          )}
          {decisions.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Decisions</Text>
              {decisions.map((item, index) => (
                <Text key={index} style={styles.bodyText}>• {item}</Text>
              ))}
            </>
          )}
          {actionItems.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Action items</Text>
              {actionItems.map((item, index) => (
                <Text key={index} style={styles.bodyText}>
                  • {item.owner ? `${item.owner}: ` : ''}
                  {item.task}
                </Text>
              ))}
            </>
          )}
          {discussionPoints.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Discussion points</Text>
              {discussionPoints.map((item, index) => (
                <Text key={index} style={styles.bodyText}>• {item}</Text>
              ))}
            </>
          )}
        </>
      )}
    </Page>
  );
}
