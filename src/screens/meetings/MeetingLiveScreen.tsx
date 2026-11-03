import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, Text, View } from 'react-native';
import { JitsiMeeting } from '@jitsi/react-native-sdk';
import { styles } from '../../theme/styles';
import { FeatureScreenProps, MeetingLaunch } from '../../types';
import { JITSI_DOMAIN, assertJitsiConfigured } from '../../lib/meeting/config';
import { MeetingAnalytics } from '../../lib/meeting/meetingAnalytics';
import { bindTicketIdentity, formatPrejoinDisplayName, redeemTicket } from '../../lib/meeting/meetingIdentity';
import { ErrorBox, Page } from '../../components/ui';

// Matches the web loader's external_api config: prejoin on with a visible,
// editable display name; welcome page off; join with mic and camera live.
const JITSI_CONFIG = {
  prejoinPageEnabled: true,
  prejoinConfig: { enabled: true, hideDisplayName: false },
  enableWelcomePage: false,
  startAudioMuted: false,
  startVideoMuted: false,
  // Analytics off: on Android the SDK's ExternalAPI native module does not
  // exist, but `isExternalAPIAvailable()` checks `!== null`, so the
  // external-api middleware is registered anyway and its `sendEvent` call
  // dereferences a null module whenever a data-channel message arrives
  // (e.g. dominant-speaker change on unmute+speaking).
  analytics: { disabled: true },
  disableThirdPartyRequests: true,
};

const JITSI_FLAGS = {
  'prejoinpage.enabled': true,
  'pip.enabled': false,
};

/**
 * Live meeting host. Renders the native Jitsi view and reproduces the web
 * loader's analytics + identity wiring:
 *  - conference joined -> create/join the meeting_sessions row, heartbeat,
 *    bind the join ticket so the transcript attributes the speaker.
 *  - remote join/leave -> count participants (peak -> max_participants).
 *  - leave (hangup / back / readyToClose) -> mark own row left, end session.
 *
 * Native prejoin is enabled, so the user sees Jitsi's own join screen with the
 * profile name prefilled before entering the room.
 */
export function MeetingLiveScreen({ launch, profile, onBack }: FeatureScreenProps & { launch: MeetingLaunch }) {
  const jitsiRef = useRef<any>(null);
  const analyticsRef = useRef<MeetingAnalytics | null>(null);
  const conferenceJoinedRef = useRef(false);
  const localIdRef = useRef<string | null>(null);
  const joinStartedRef = useRef(false);
  const leftRef = useRef(false);

  const profileDisplayName =
    formatPrejoinDisplayName(profile?.full_name, profile?.profession) ?? '';
  const [displayName, setDisplayName] = useState(profileDisplayName);
  const [identityReady, setIdentityReady] = useState(false);

  // Create the analytics instance once for this meeting.
  if (!analyticsRef.current) {
    analyticsRef.current = new MeetingAnalytics();
  }

  useEffect(() => {
    analyticsRef.current?.initialize({ roomName: launch.room, mtbId: launch.mtbId });
  }, [launch.room, launch.mtbId]);

  // Redeem the ticket before mounting Jitsi so its prejoin form starts with
  // the server-verified name. The authenticated profile name remains the
  // fail-soft fallback if identity verification is unavailable.
  useEffect(() => {
    let active = true;
    void redeemTicket(launch.ticket).then((identity) => {
      if (!active) return;
      setDisplayName(
        formatPrejoinDisplayName(identity?.displayName, identity?.profession) ?? profileDisplayName,
      );
      setIdentityReady(true);
    });
    return () => {
      active = false;
    };
  }, [launch.ticket, profileDisplayName]);

  // Runs the session-create + identity bind exactly once, as soon as both the
  // conference is joined and the local participant id is known (either source).
  const maybeBeginJoin = useCallback(async () => {
    if (!conferenceJoinedRef.current || !localIdRef.current || joinStartedRef.current) return;
    joinStartedRef.current = true;
    const id = localIdRef.current;
    await analyticsRef.current?.onLocalParticipantJoined(id);
    await bindTicketIdentity({
      ticket: launch.ticket,
      participantId: id,
      meetingSessionId: analyticsRef.current?.getMeetingSessionId() ?? null,
      displayName: displayName || null,
    });
  }, [launch.ticket, displayName]);

  // The ONLY time a session is marked ended. Idempotent (leftRef + analytics guard).
  const handleLeave = useCallback(() => {
    if (leftRef.current) return;
    leftRef.current = true;
    void analyticsRef.current?.onLocalParticipantLeft('normal');
    onBack();
  }, [onBack]);

  // --- Jitsi event listeners. Captured once by the SDK at mount, so they read
  // from refs (stable) rather than state. ---
  const handleConferenceJoined = useCallback(() => {
    conferenceJoinedRef.current = true;
    try {
      const info = jitsiRef.current?.getRoomsInfo?.() as any;
      const local = info?.rooms?.[0]?.participants?.[0]?.id;
      if (typeof local === 'string' && local) localIdRef.current = local;
    } catch {
      // getRoomsInfo is best-effort; the local participantJoined event is the fallback.
    }
    void maybeBeginJoin();
  }, [maybeBeginJoin]);

  const handleParticipantJoined = useCallback(
    (info: any) => {
      if (info?.isLocal) {
        if (!localIdRef.current && typeof info?.participantId === 'string') {
          localIdRef.current = info.participantId;
        }
        void maybeBeginJoin();
        return;
      }
      if (typeof info?.participantId === 'string') {
        void analyticsRef.current?.onParticipantJoined(info.participantId);
      }
    },
    [maybeBeginJoin],
  );

  const handleParticipantLeft = useCallback(({ id }: { id: string }) => {
    if (!id) return;
    // Analytics skips the local participant by its tracked id.
    void analyticsRef.current?.onParticipantLeft(id);
  }, []);

  const eventListeners = {
    onConferenceJoined: handleConferenceJoined,
    onParticipantJoined: handleParticipantJoined,
    onParticipantLeft: handleParticipantLeft,
    onReadyToClose: handleLeave,
  };

  // Hardware back = leave the meeting (rather than exiting the app).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleLeave();
      return true;
    });
    return () => sub.remove();
  }, [handleLeave]);

  // Backgrounding: send one extra heartbeat so the session stays alive while
  // the app is not foregrounded (web visibilitychange -> hidden parity).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && !leftRef.current) {
        void analyticsRef.current?.sendHeartbeat();
      }
    });
    return () => sub.remove();
  }, []);

  // Unmount without a clean leave (navigate away, kill): end the session so a
  // ghost status='active' row doesn't hold the VM.
  useEffect(() => {
    return () => {
      if (!leftRef.current) {
        leftRef.current = true;
        void analyticsRef.current?.onLocalParticipantLeft('normal');
      }
    };
  }, []);

  if (!JITSI_DOMAIN) {
    return (
      <Page title="Meeting" onBack={onBack}>
        <ErrorBox message={assertJitsiConfiguredError()} />
      </Page>
    );
  }

  if (!identityReady) {
    return (
      <Page title="Meeting" onBack={onBack}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#4A90E2" />
          <Text style={styles.muted}>Preparing your meeting…</Text>
        </View>
      </Page>
    );
  }

  return (
    <View style={styles.meetingContainer}>
      <JitsiMeeting
        ref={jitsiRef}
        room={launch.room}
        serverURL={`https://${JITSI_DOMAIN}`}
        config={JITSI_CONFIG}
        flags={JITSI_FLAGS}
        userInfo={{ displayName, avatarURL: '', email: '' }}
        eventListeners={eventListeners}
        style={{ flex: 1 }}
      />
    </View>
  );
}

function assertJitsiConfiguredError() {
  try {
    assertJitsiConfigured();
  } catch (e) {
    return e instanceof Error ? e.message : 'Meeting is not configured.';
  }
  return 'Meeting is not configured.';
}
