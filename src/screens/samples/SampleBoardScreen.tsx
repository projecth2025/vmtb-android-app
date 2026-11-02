import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { styles } from '../../theme/styles';
import { SAMPLE_BOARD } from '../../data/sampleCase';
import { Button, Page, Pill } from '../../components/ui';

function sampleToast(action: string) {
  Alert.alert('Sample board', `${action} is disabled in the sample board. Create or join a real MTB to use this.`);
}

export function SampleBoardScreen({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<'cases' | 'meetings'>('cases');

  return (
    <Page title="Sample Board" onBack={onBack}>
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
            <Pressable key={item.id} style={styles.caseCard} onPress={() => sampleToast('Opening the sample case')}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>{item.caseName}</Text>
                <Pill label={item.status} active />
              </View>
              <Text style={styles.bodyText}>
                {item.cancerType} · {item.owner}
              </Text>
              <Text style={styles.muted}>
                Age {item.age} · {item.sex} · {item.opinions} opinions
              </Text>
            </Pressable>
          ))}
          <Button title="Start / Join Meeting" secondary onPress={() => sampleToast('Starting a meeting')} />
        </>
      ) : (
        <>
          <Text style={styles.muted}>
            Sample meetings are not created so a billable meeting room is never started. Meeting history and minutes
            appear here on a real board.
          </Text>
          <Button title="Start / Join Meeting" secondary onPress={() => sampleToast('Starting a meeting')} />
        </>
      )}
      <Button title="Leave MTB (sample)" secondary onPress={() => sampleToast('Leaving the board')} />
      <Pressable onPress={onBack}>
        <Text style={styles.link}>Back to MTBs</Text>
      </Pressable>
    </Page>
  );
}
