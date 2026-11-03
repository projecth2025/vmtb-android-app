import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Asset } from 'expo-asset';
import Pdf from 'react-native-pdf';
import Markdown from 'react-native-markdown-display';
import {
  AlertTriangle,
  Archive,
  CheckCircle,
  FileText,
  FlaskConical,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react-native';
import { styles } from '../../theme/styles';
import { Profile, Role } from '../../types';
import {
  SAMPLE_AGE,
  SAMPLE_CANCER_TYPE,
  SAMPLE_CASE_NAME,
  SAMPLE_FILE_NAME,
  SAMPLE_OPINION,
  SAMPLE_PATIENT,
  SAMPLE_QUESTIONS,
  SAMPLE_SEX,
  SAMPLE_SUMMARY,
  SAMPLE_TREATMENT,
} from '../../data/sampleCase';
import { Button, Field, FormModal, Page } from '../../components/ui';

// The walkthrough's sample case, ported from the web's SampleCase.tsx.
// Everything here is local to this screen: nothing is uploaded, saved or
// shared, and no pipeline runs. The other tabs stay locked until the summary
// is verified, exactly like the web sample.

type SampleTab = 'summary' | 'reports' | 'opinions' | 'treatment' | 'settings';

const TABS: { id: SampleTab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'reports', label: 'Reports' },
  { id: 'opinions', label: 'Opinions' },
  { id: 'treatment', label: 'Treatment' },
  { id: 'settings', label: 'Settings' },
];

type SampleStatus = 'processing' | 'unverified' | 'verified';

// Web's SUMMARY_STATUS_META labels and status token colors (index.css).
const STATUS_META: Record<SampleStatus, { label: string; bg: string; text: string }> = {
  processing: { label: 'In Progress', bg: '#eff6ff', text: '#1d4ed8' },
  unverified: { label: 'Pending', bg: '#fefce8', text: '#a16207' },
  verified: { label: 'Complete', bg: '#f0fdf4', text: '#15803d' },
};

const VERIFY_BULLETS = [
  'Unlocks Reports, Opinions and Treatment plan',
  'Is shared with the MTBs you chose (in a real case)',
];

interface SampleOpinion {
  id: string;
  author: string;
  role: string;
  content: string;
}

const SEED_OPINION: SampleOpinion = {
  id: 'sample-opinion-1',
  author: SAMPLE_OPINION.author,
  role: SAMPLE_OPINION.role,
  content: SAMPLE_OPINION.content,
};

const tabItem = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 };
const fieldRow = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 };
const fieldCell = { flexGrow: 1, minWidth: 140 };
const detailGrid = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 10 };
const detailCell = {
  backgroundColor: '#f9fafb',
  borderWidth: 1,
  borderColor: '#e5e7eb',
  borderRadius: 10,
  padding: 12,
  gap: 4,
  flexGrow: 1,
  minWidth: 145,
};
const noteBox = {
  backgroundColor: '#f9fafb',
  borderWidth: 1,
  borderColor: '#e5e7eb',
  borderRadius: 10,
  padding: 13,
  gap: 4,
};

export function SampleCaseScreen({
  onBack,
  role,
  profile,
}: {
  onBack: () => void;
  role: Role;
  profile: Profile | null;
}) {
  const [ready, setReady] = useState(false);
  const [verified, setVerified] = useState(false);
  const [showVerify, setShowVerify] = useState(false);
  const [tab, setTab] = useState<SampleTab>('summary');
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(SAMPLE_SUMMARY);
  const baselineRef = useRef(SAMPLE_SUMMARY);
  const [opinions, setOpinions] = useState<SampleOpinion[]>([SEED_OPINION]);
  const [opinionText, setOpinionText] = useState('');
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState('');

  // Without the walkthrough to mark it ready, the sample doesn't stay
  // "In Progress" for long (web: READY_FALLBACK_MS only while the tour runs).
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(timer);
  }, []);

  // The bundled sample report, resolved to a local file the PDF viewer reads.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const asset = Asset.fromModule(require('../../../assets/sample-case-report.pdf'));
        await asset.downloadAsync();
        if (alive) setPdfUri(asset.localUri ?? asset.uri);
      } catch (e) {
        console.warn('[sample] could not load the sample report', e);
        if (alive) setPdfError('Could not load the sample report.');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const status: SampleStatus = verified ? 'verified' : ready ? 'unverified' : 'processing';
  // A Site Data Coordinator never sees Opinions on a real case, so the sample
  // must not teach a tab this role will never have.
  const visibleTabs = TABS.filter((item) => item.id !== 'opinions' || role !== 'site_data_coordinator');

  const openTab = (next: SampleTab) => {
    if (next !== 'summary' && !verified) {
      Alert.alert('Verify the case first to unlock this tab.');
      return;
    }
    setTab(next);
  };

  const startEdit = () => {
    baselineRef.current = summary;
    setEditing(true);
  };
  const saveEdits = () => setEditing(false);
  const cancelEdit = () => {
    setSummary(baselineRef.current);
    setEditing(false);
  };
  const saveAndVerify = () => {
    setEditing(false);
    setShowVerify(true);
  };
  const confirmVerify = () => {
    setVerified(true);
    setShowVerify(false);
    Alert.alert('Sample case verified');
  };

  const postOpinion = () => {
    const content = opinionText.trim();
    if (!content) return;
    setOpinions((previous) => [
      ...previous,
      {
        id: `local-${Date.now()}`,
        author: profile?.full_name?.trim() || 'You',
        role: 'You',
        content,
      },
    ]);
    setOpinionText('');
  };

  return (
    <Page title="Sample Case" onBack={onBack}>
      {/* Same tab bar as a real case; locked until the summary is verified. */}
      <View style={styles.tabRow}>
        {visibleTabs.map(({ id, label }) => {
          const locked = id !== 'summary' && !verified;
          return (
            <Pressable
              key={id}
              onPress={() => openTab(id)}
              disabled={locked}
              accessibilityRole="button"
              accessibilityLabel={locked ? `${label}, verify the case first to unlock this tab` : label}
              style={[styles.pill, tab === id && styles.pillActive, locked && styles.pillDisabled, tabItem]}
            >
              {locked && <Lock size={12} color="#8a93a2" />}
              <Text style={[styles.pillText, tab === id && styles.pillTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Sample banner */}
      <View style={[styles.info, { backgroundColor: '#fefce8', borderColor: '#fef9c3' }]}>
        <FlaskConical size={18} color="#a16207" />
        <Text style={[styles.infoText, { color: '#a16207' }]}>
          This is a sample case. Nothing here is uploaded or saved.
        </Text>
        <Pressable onPress={onBack} accessibilityRole="button">
          <Text style={[styles.link, { color: '#a16207' }]}>Exit sample</Text>
        </Pressable>
      </View>

      {tab === 'summary' && (
        <View style={styles.cardPanel}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.cardTitle}>{SAMPLE_CASE_NAME}</Text>
              <Text style={styles.muted}>
                {SAMPLE_CANCER_TYPE} · {SAMPLE_PATIENT}
              </Text>
            </View>
            <StatusPill status={status} />
          </View>

          <View style={fieldRow}>
            <View style={fieldCell}>
              <Field label="Age" value={ready ? String(SAMPLE_AGE) : '—'} editable={false} />
            </View>
            <View style={fieldCell}>
              <Field label="Sex" value={ready ? SAMPLE_SEX : '—'} editable={false} />
            </View>
            <View style={fieldCell}>
              <Field label="Cancer Type" value={SAMPLE_CANCER_TYPE} editable={false} />
            </View>
          </View>

          {ready && !verified && !editing && (
            <View style={styles.row}>
              <Button title="Verify Case" onPress={() => setShowVerify(true)} />
              <Button title="Edit" secondary onPress={startEdit} />
            </View>
          )}
          {editing && (
            <View style={styles.row}>
              <Button title="Save Changes" onPress={saveEdits} />
              <Button title="Save & Verify" secondary onPress={saveAndVerify} />
              <Button title="Cancel" secondary onPress={cancelEdit} />
            </View>
          )}

          {!ready ? (
            <SummarySkeleton />
          ) : editing ? (
            <Field label="Summary (markdown)" value={summary} onChangeText={setSummary} multiline />
          ) : (
            <Markdown style={markdownStyles}>{summary}</Markdown>
          )}

          {verified && (
            <Text style={styles.muted}>
              Verified by <Text style={{ fontWeight: '600' }}>you</Text>
            </Text>
          )}
        </View>
      )}

      {tab === 'reports' && (
        <>
          <View style={styles.cardPanel}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.cardTitle}>Documents</Text>
                <Text style={styles.muted}>The copy the board sees, with patient identifiers masked.</Text>
              </View>
              <View style={[styles.pill, { backgroundColor: '#f0fdf4', borderColor: '#15803d', ...tabItem }]}>
                <ShieldCheck size={13} color="#15803d" />
                <Text style={[styles.pillText, { color: '#15803d', fontWeight: '600' }]}>Identifiers masked</Text>
              </View>
            </View>

            <View style={styles.fileRow}>
              <FileText size={19} color="#4A90E2" />
              <Text numberOfLines={1} style={styles.fileName}>
                {SAMPLE_FILE_NAME}
              </Text>
            </View>

            {pdfUri ? (
              <Pdf source={{ uri: pdfUri }} style={{ height: 460 }} spacing={8} onError={() => setPdfError('Could not render the sample report.')} />
            ) : (
              <Text style={styles.muted}>{pdfError || 'Loading the sample report…'}</Text>
            )}
          </View>

          <View style={styles.cardPanel}>
            <Text style={styles.cardTitle}>Case Explanation</Text>
            <View style={noteBox}>
              <Text style={[styles.muted, { fontStyle: 'italic' }]}>
                No notes added. In step 2 of a new case you can type them.
              </Text>
            </View>
          </View>
        </>
      )}

      {tab === 'opinions' && (
        <>
          <View style={styles.cardPanel}>
            <Text style={styles.cardTitle}>General Opinions</Text>
            <Field
              label="Your opinion"
              value={opinionText}
              onChangeText={setOpinionText}
              multiline
              placeholder="Write your opinion..."
            />
            <Button title="Post opinion" onPress={postOpinion} disabled={!opinionText.trim()} />
            {opinions.map((opinion) => (
              <View key={opinion.id} style={styles.opinion}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>{opinion.author}</Text>
                  <Text style={styles.muted}>{opinion.role}</Text>
                </View>
                <Text style={styles.bodyText}>{opinion.content}</Text>
              </View>
            ))}
          </View>

          <View style={styles.cardPanel}>
            <Text style={styles.cardTitle}>Specific Questions</Text>
            {SAMPLE_QUESTIONS.map((question) => (
              <View key={question} style={styles.questionCard}>
                <Text style={styles.bodyText}>{question}</Text>
                <Text style={styles.muted}>No answers yet</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {tab === 'treatment' && (
        <View style={styles.cardPanel}>
          <View>
            <Text style={styles.cardTitle}>Treatment Plan</Text>
            <Text style={styles.muted}>In a real case, you record the board’s plan and follow-ups here.</Text>
          </View>
          <View style={detailGrid}>
            <Detail label="Discussion" value={SAMPLE_TREATMENT.discussionDate} />
            <Detail label="Predominant pathway" value={SAMPLE_TREATMENT.pathway} />
            <Detail label="Therapy recommendation" value={SAMPLE_TREATMENT.recommendation} />
            <Detail label="AMP level of evidence" value={SAMPLE_TREATMENT.ampLevel} />
            <Detail label="ESCAT level" value={SAMPLE_TREATMENT.escatLevel} />
            <Detail label="Overall evidence strength" value={SAMPLE_TREATMENT.evidence} />
          </View>
          <View style={{ borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 14, gap: 8 }}>
            <Text style={styles.label}>Follow-Up</Text>
            <View style={noteBox}>
              <Text style={styles.bodyText}>{SAMPLE_TREATMENT.followUp.label}</Text>
              <Text style={styles.muted}>{SAMPLE_TREATMENT.followUp.status}</Text>
              <Text style={styles.muted}>{SAMPLE_TREATMENT.followUp.notes}</Text>
            </View>
          </View>
        </View>
      )}

      {tab === 'settings' && (
        <View style={{ gap: 14 }}>
          <Text style={styles.muted}>
            A sample can’t be shared, archived or deleted. On a real case these work as described.
          </Text>
          <SettingRow
            title="MTB sharing"
            body="Choose which MTBs can view and discuss the case."
            label="Add to MTBs"
            icon={<Plus size={15} color="#fff" />}
            primary
          />
          <SettingRow
            title="Archive case"
            body="Hide the case from My Cases and remove it from all MTBs. You can restore it anytime."
            label="Archive"
            icon={<Archive size={15} color="#4A5565" />}
          />
          <SettingRow
            title="Danger zone"
            body="Permanently delete the case and all its documents, opinions and questions."
            label="Delete case"
            icon={<Trash2 size={15} color="#fff" />}
            danger
          />
        </View>
      )}

      {/* Verify dialog — same copy as the web's sample VerifyModal. */}
      <FormModal visible={showVerify} title="Verify Case Summary" onClose={() => setShowVerify(false)}>
        <View style={{ alignItems: 'center', paddingVertical: 6 }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: '#fef3c7',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AlertTriangle size={22} color="#b45309" />
          </View>
        </View>
        <Text style={[styles.muted, { textAlign: 'center' }]}>Once you verify this summary, the case:</Text>
        <View
          style={{
            flexDirection: 'row',
            gap: 8,
            backgroundColor: '#fffbeb',
            borderWidth: 1,
            borderColor: '#fde68a',
            borderRadius: 10,
            padding: 12,
          }}
        >
          <Lock size={16} color="#b45309" />
          <Text style={[styles.bodyText, { color: '#92400e', fontWeight: '600', flex: 1 }]}>
            This case becomes permanently non-editable.
          </Text>
        </View>
        {VERIFY_BULLETS.map((bullet) => (
          <View key={bullet} style={{ flexDirection: 'row', gap: 8 }}>
            <Text style={{ color: '#2f6fc4', fontWeight: '700', fontSize: 14 }}>•</Text>
            <Text style={[styles.muted, { flex: 1 }]}>{bullet}</Text>
          </View>
        ))}
        <Text style={[styles.muted, { textAlign: 'center' }]}>This is a sample, so nothing is saved.</Text>
        <View style={[styles.row, { justifyContent: 'flex-end' }]}>
          <Button title="Cancel" secondary onPress={() => setShowVerify(false)} />
          <Button title="Verify" onPress={confirmVerify} />
        </View>
      </FormModal>
    </Page>
  );
}

function StatusPill({ status }: { status: SampleStatus }) {
  const meta = STATUS_META[status];
  return (
    <View style={[styles.pill, { backgroundColor: meta.bg, borderColor: meta.text, ...tabItem }]}>
      {status === 'verified' && <CheckCircle size={13} color={meta.text} />}
      <Text style={[styles.pillText, { color: meta.text, fontWeight: '600' }]}>{meta.label}</Text>
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={detailCell}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.bodyText}>{value}</Text>
    </View>
  );
}

/** A disabled copy of one of the real Settings rows. */
function SettingRow({
  title,
  body,
  label,
  icon,
  primary = false,
  danger = false,
}: {
  title: string;
  body: string;
  label: string;
  icon: React.ReactNode;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <View style={[styles.cardPanel, danger && { borderColor: '#fecaca' }]}>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={[styles.cardTitle, danger && { color: '#b91c1c' }]}>{title}</Text>
          <Text style={styles.muted}>{body}</Text>
        </View>
        <Pressable
          disabled
          accessibilityLabel={`${label} — not available on the sample`}
          style={[
            styles.button,
            primary ? null : styles.secondary,
            danger && { backgroundColor: '#b91c1c', borderColor: '#b91c1c' },
            { marginTop: 0, marginBottom: 0, minHeight: 40, opacity: 0.55 },
          ]}
        >
          <View style={styles.buttonInner}>
            {icon}
            <Text style={[styles.buttonText, !primary && !danger && styles.secondaryText]}>
              {label}
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

/** Where the summary will appear, while the case is "In Progress". */
function SummarySkeleton() {
  return (
    <View style={{ gap: 10, paddingVertical: 6 }}>
      <View style={{ height: 16, width: 150, backgroundColor: '#e5e7eb', borderRadius: 4 }} />
      <View style={{ height: 12, backgroundColor: '#e5e7eb', borderRadius: 4 }} />
      <View style={{ height: 12, width: '92%', backgroundColor: '#e5e7eb', borderRadius: 4 }} />
      <View style={{ height: 16, width: 130, backgroundColor: '#e5e7eb', borderRadius: 4, marginTop: 14 }} />
      <View style={{ height: 12, backgroundColor: '#e5e7eb', borderRadius: 4 }} />
      <View style={{ height: 12, width: '80%', backgroundColor: '#e5e7eb', borderRadius: 4 }} />
    </View>
  );
}

const markdownStyles = {
  body: { color: '#1f2937', fontSize: 14, lineHeight: 21 },
  heading1: { fontSize: 20, fontWeight: '700' as const, marginTop: 10, marginBottom: 4 },
  heading2: { fontSize: 17, fontWeight: '700' as const, marginTop: 8, marginBottom: 4 },
  heading3: { fontSize: 15, fontWeight: '600' as const, marginTop: 6, marginBottom: 2 },
  strong: { fontWeight: '700' as const },
  em: { fontStyle: 'italic' as const },
  paragraph: { marginTop: 4, marginBottom: 4 },
  bullet_list: { marginTop: 4, marginBottom: 4 },
  ordered_list: { marginTop: 4, marginBottom: 4 },
  list_item: { marginTop: 2, marginBottom: 2 },
  link: { color: '#4A90E2' },
};
