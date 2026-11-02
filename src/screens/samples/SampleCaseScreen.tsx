import { useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';
import { styles } from '../../theme/styles';
import {
  SAMPLE_AGE,
  SAMPLE_CANCER_TYPE,
  SAMPLE_CASE_NAME,
  SAMPLE_OPINION,
  SAMPLE_PAGE_COUNT,
  SAMPLE_PATIENT,
  SAMPLE_QUESTIONS,
  SAMPLE_SEX,
  SAMPLE_SUMMARY,
  SAMPLE_TREATMENT,
} from '../../data/sampleCase';
import { Button, EmptyCard, Page, Pill } from '../../components/ui';

const TABS = ['summary', 'reports', 'opinions', 'treatment', 'settings'] as const;
type SampleTab = (typeof TABS)[number];

export function SampleCaseScreen({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<SampleTab>('summary');
  const [summary, setSummary] = useState(SAMPLE_SUMMARY);
  const [saved, setSaved] = useState(false);

  return (
    <Page title="Sample Case" onBack={onBack}>
      <View style={styles.codeCard}>
        <Text style={styles.muted}>Local sample — nothing is uploaded or processed.</Text>
        <Text style={styles.codeText}>{SAMPLE_CASE_NAME}</Text>
        <Text style={styles.muted}>
          {SAMPLE_CANCER_TYPE} · {SAMPLE_PATIENT} · Age {SAMPLE_AGE} · {SAMPLE_SEX}
        </Text>
        <Pill label="verified" active />
      </View>
      <View style={styles.tabRow}>
        {TABS.map((value) => (
          <Pill key={value} label={value} active={tab === value} onPress={() => setTab(value)} />
        ))}
      </View>

      {tab === 'summary' && (
        <>
          <Text style={styles.sectionTitle}>Case details</Text>
          <Text style={styles.label}>Case name</Text>
          <Text style={styles.bodyText}>{SAMPLE_CASE_NAME}</Text>
          <Text style={styles.label}>Patient</Text>
          <Text style={styles.bodyText}>
            {SAMPLE_PATIENT} · Age {SAMPLE_AGE} · {SAMPLE_SEX}
          </Text>
          <Text style={styles.label}>Cancer type</Text>
          <Text style={styles.bodyText}>{SAMPLE_CANCER_TYPE}</Text>
          <Text style={styles.sectionTitle}>Summary</Text>
          <Text style={styles.bodyText}>{summary}</Text>
          <Button
            title={saved ? 'Sample changes saved locally' : 'Save changes (local only)'}
            onPress={() => {
              setSaved(true);
              Alert.alert('Sample mode', 'Edits stay on this device and are not sent to the server.');
            }}
          />
        </>
      )}

      {tab === 'reports' && (
        <EmptyCard
          title={`${SAMPLE_PAGE_COUNT}-page sample report`}
          body="The sample report is a local demo document. In the real flow, generated reports appear here for viewing and redaction."
        />
      )}

      {tab === 'opinions' && (
        <>
          <Text style={styles.sectionTitle}>Questions for the board</Text>
          {SAMPLE_QUESTIONS.map((question) => (
            <View key={question} style={styles.questionCard}>
              <Text style={styles.bodyText}>{question}</Text>
            </View>
          ))}
          <Text style={styles.sectionTitle}>Opinions</Text>
          <View style={styles.opinion}>
            <Text style={styles.cardTitle}>{SAMPLE_OPINION.author}</Text>
            <Text style={styles.muted}>{SAMPLE_OPINION.role}</Text>
            <Text style={styles.bodyText}>{SAMPLE_OPINION.content}</Text>
          </View>
          <Text style={styles.muted}>
            Sample opinions are read-only. Create a real case and share it with an MTB to post opinions.
          </Text>
        </>
      )}

      {tab === 'treatment' && (
        <>
          <Text style={styles.sectionTitle}>Treatment plan</Text>
          <Text style={styles.label}>Discussion</Text>
          <Text style={styles.bodyText}>{SAMPLE_TREATMENT.discussionDate}</Text>
          <Text style={styles.label}>Recommendation</Text>
          <Text style={styles.bodyText}>{SAMPLE_TREATMENT.recommendation}</Text>
          <Text style={styles.label}>Pathway</Text>
          <Text style={styles.bodyText}>{SAMPLE_TREATMENT.pathway}</Text>
          <Text style={styles.label}>Evidence</Text>
          <Text style={styles.bodyText}>{SAMPLE_TREATMENT.evidence}</Text>
          <View style={styles.rowBetween}>
            <Text style={styles.bodyText}>Treatment implemented</Text>
            <Switch value={SAMPLE_TREATMENT.implemented} disabled />
          </View>
          <Text style={styles.sectionTitle}>Follow-up</Text>
          <View style={styles.cardPanel}>
            <Text style={styles.cardTitle}>{SAMPLE_TREATMENT.followUp.label}</Text>
            <Text style={styles.bodyText}>Status: {SAMPLE_TREATMENT.followUp.status}</Text>
            <Text style={styles.bodyText}>{SAMPLE_TREATMENT.followUp.notes}</Text>
          </View>
        </>
      )}

      {tab === 'settings' && (
        <>
          <Text style={styles.sectionTitle}>Settings</Text>
          <Text style={styles.bodyText}>
            Sample cases cannot be shared, archived, or deleted. Create a real case from the New Case wizard to use
            these actions.
          </Text>
          <Pressable onPress={onBack}>
            <Text style={styles.link}>Back to My Cases</Text>
          </Pressable>
        </>
      )}
    </Page>
  );
}
