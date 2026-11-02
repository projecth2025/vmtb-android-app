import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { styles } from '../../theme/styles';
import { FeatureScreenProps, MeetingLaunch } from '../../types';
import { MeetingService, ComponentState } from '../../lib/meeting/meetingService';
import { Button, ErrorBox, Page } from '../../components/ui';

const COMPONENT_LABELS: Record<string, string> = {
  jvb: 'Jitsi server',
  stt: 'Speech recognition',
  proxy: 'Transcription proxy',
};

function componentLine(components: Record<string, ComponentState>): string {
  const keys = Object.keys(components);
  if (keys.length === 0) return 'Connecting to server...';
  const notReady = keys.filter((name) => components[name]?.state !== 'ready');
  if (notReady.length === 0) return 'Finalizing connection...';
  return notReady
    .map((name) => {
      const c = components[name];
      const label = COMPONENT_LABELS[name] ?? name;
      return c?.detail ? `${label}: ${c.detail}` : `${label}: ${c?.state ?? 'starting'}`;
    })
    .join('  ·  ');
}

/**
 * Waiting room: polls the activation backend until the on-demand Jitsi VM is
 * up, then hands off to the live meeting screen. Parity with the web loader's
 * MeetingLoader state.
 */
export function MeetingWaitingScreen({ launch, onBack, onNavigate }: FeatureScreenProps & { launch: MeetingLaunch }) {
  const [elapsed, setElapsed] = useState(0);
  const [components, setComponents] = useState<Record<string, ComponentState>>({});
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const mountedRef = useRef(true);
  const serviceRef = useRef<MeetingService | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    const service = new MeetingService();
    serviceRef.current = service;

    const timer = setInterval(() => {
      if (mountedRef.current) setElapsed((s) => s + 1);
    }, 1000);

    service
      .waitForMeetingReady(launch.ticket, (next) => {
        if (mountedRef.current) setComponents(next);
      })
      .then(() => {
        if (mountedRef.current) onNavigate('meeting-live');
      })
      .catch((e: unknown) => {
        if (mountedRef.current) {
          setError(e instanceof Error ? e.message : 'Could not reach the meeting server.');
        }
      });

    return () => {
      mountedRef.current = false;
      clearInterval(timer);
      service.cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launch.ticket, retry]);

  return (
    <Page title="Starting meeting" onBack={onBack}>
      {error ? (
        <>
          <ErrorBox message={error} />
          <Button
            title="Retry"
            onPress={() => {
              setError('');
              setComponents({});
              setRetry((attempt) => attempt + 1);
            }}
          />
        </>
      ) : (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#4A90E2" />
          <Text style={styles.sectionTitle}>Initializing Meeting</Text>
          <Text style={styles.muted}>{componentLine(components)}</Text>
          <Text style={styles.muted}>
            {elapsed} second{elapsed !== 1 ? 's' : ''} elapsed
          </Text>
          <Text style={styles.muted}>Please wait while we set up your meeting room</Text>
        </View>
      )}
    </Page>
  );
}
