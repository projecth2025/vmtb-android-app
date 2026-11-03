import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { styles } from '../../theme/styles';
import { Role, Screen } from '../../types';
import { SAMPLE_BOARD } from '../../data/sampleCase';
import { Button, Page, Pill } from '../../components/ui';

function sampleToast(action: string) {
  Alert.alert('Sample board', `${action} is disabled in the sample board. Create or join a real MTB to use this.`);
}

export function SampleBoardScreen({
  onBack,
  role,
  onNavigate,
}: {
  onBack: () => void;
  role: Role;
  onNavigate: (screen: Screen) => void;
}) {
  const [tab, setTab] = useState<'cases' | 'meetings'>('cases');

  return (
    <Page title="Sample Board" onBack={onBack}>
      <View style={[styles.info, { backgroundColor: '#fefce8', borderColor: '#fef9c3' }]}>
        <Text style={[styles.infoText, { color: '#a16207' }]}>This is a sample board, to show you around.</Text>
      </View>
      <View style={styles.codeCard}>
        <Text style={styles.muted}>Local sample board — no meeting code is issued.</Text>
        <Text style={styles.codeText}>{SAMPLE_BOARD.inviteCode}</Text>
        <Text style={styles.bodyText}>{SAMPLE_BOARD.name}</Text>
        <Text style={styles.muted}>
          {SAMPLE_BOARD.experts} experts · {SAMPLE_BOARD.cases.length} case
        </Text>
      </View>
      <View style={styles.row}>
        {(['cases', 'meetings'] as const).map((value) => (
          <Pill key={value} label={value} active={tab === value} onPress={() => setTab(value)} />
        ))}
      </View>
      {tab === 'cases' ? (
        <>
          <Button title="Add case (sample)" secondary onPress={() => sampleToast('Adding a case')} />
          {SAMPLE_BOARD.cases.map((item) => (
            <Pressable key={item.id} style={styles.caseCard} onPress={() => onNavigate('sample-case')}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>{item.caseName}</Text>
                <Pill label="Not reviewed" active />
              </View>
              <Text style={styles.bodyText}>
                {item.cancerType} · {item.owner}
              </Text>
              <Text style={styles.muted}>
                Age {item.age} · {item.sex} · {item.opinions} opinions
              </Text>
            </Pressable>
          ))}
          {/* The real board hides this button for a Site Data Coordinator, so
              the sample shouldn't teach it either (web SampleBoard). */}
          {role !== 'site_data_coordinator' && (
            <Button title="Start / Join Meeting" secondary onPress={() => sampleToast('Starting a meeting')} />
          )}
        </>
      ) : (
        <>
          <Text style={styles.muted}>
            Sample meetings are not created so a billable meeting room is never started. Meeting history and minutes
            appear here on a real board.
          </Text>
          {role !== 'site_data_coordinator' && (
            <Button title="Start / Join Meeting" secondary onPress={() => sampleToast('Starting a meeting')} />
          )}
        </>
      )}
      <Button title="Leave MTB (sample)" secondary onPress={() => sampleToast('Leaving the board')} />
      <Pressable onPress={onBack}>
        <Text style={styles.link}>Back to MTBs</Text>
      </Pressable>
    </Page>
  );
}
