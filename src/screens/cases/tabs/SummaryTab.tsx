import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { styles } from '../../../theme/styles';
import { CaseDetail, VerifiedSnapshot } from '../../../types';
import { saveSummary } from '../../../lib/api/cases';
import { mapPipelineError, retryCaseRun, startPipelineRun, CaseRunState } from '../../../lib/api/pipeline';
import { Button, ErrorBox, Field, Loading, Pill } from '../../../components/ui';

export function SummaryTab({
  record,
  editable,
  onRefresh,
  runState,
  memberSnapshot,
}: {
  record: CaseDetail;
  editable: boolean;
  onRefresh: () => Promise<void>;
  runState?: CaseRunState | null;
  memberSnapshot?: VerifiedSnapshot | null;
}) {
  const [summary, setSummary] = useState(record.summary ?? '');
  const [age, setAge] = useState(record.patient_age == null ? '' : String(record.patient_age));
  const [sex, setSex] = useState(record.patient_sex ?? '');
  const [patientName, setPatientName] = useState(record.patient_name ?? 'Anonymous');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    // Never clobber in-progress edits when a poll refreshes the case row.
    if (editing) return;
    setSummary(record.summary ?? '');
    setAge(record.patient_age == null ? '' : String(record.patient_age));
    setSex(record.patient_sex ?? '');
    setPatientName(record.patient_name ?? 'Anonymous');
  }, [record, editing]);

  const save = async (verify = false) => {
    setBusy(true);
    setError('');
    try {
      const generation = record.content_generation ?? record.summary_generation ?? 0;
      const updated: any = await saveSummary(
        record.id,
        generation,
        summary,
        age ? Number(age) : null,
        sex || null,
        patientName || 'Anonymous',
        record.cancer_type ?? '',
        verify,
      );
      if (verify && (!updated || updated.summary_status !== 'verified')) {
        throw new Error('The case could not be verified. Refresh and try again.');
      }
      await onRefresh();
      setEditing(false);
      Alert.alert(
        verify ? 'Case verified' : 'Changes saved',
        verify ? 'The current case summary is now verified.' : 'Your summary changes were saved.',
      );
    } catch (e) {
      setError(mapPipelineError(e, 'Could not save the summary.'));
    } finally {
      setBusy(false);
    }
  };

  const verify = () => {
    if (!age || !sex) return setError('Add the patient’s age and sex before verifying.');
    Alert.alert('Verify this case?', 'MTB members will be able to review this verified version.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Verify', onPress: () => void save(true) },
    ]);
  };

  const cancelEdit = () => {
    setSummary(record.summary ?? '');
    setAge(record.patient_age == null ? '' : String(record.patient_age));
    setSex(record.patient_sex ?? '');
    setPatientName(record.patient_name ?? 'Anonymous');
    setError('');
    setEditing(false);
  };

  const regenerate = async () => {
    if ((record.summary_regeneration_count ?? 0) >= 5) {
      return setError('This case has reached its limit of 5 summary regenerations.');
    }
    setBusy(true);
    setError('');
    try {
      await startPipelineRun(record.id, 'regenerate');
      setEditing(false);
      await onRefresh();
    } catch (e) {
      setError(mapPipelineError(e, 'Could not regenerate summary.'));
    } finally {
      setBusy(false);
    }
  };

  const retry = async () => {
    setBusy(true);
    setError('');
    try {
      await retryCaseRun(record.id);
      await onRefresh();
    } catch (e) {
      setError(mapPipelineError(e, 'Could not retry processing.'));
    } finally {
      setBusy(false);
    }
  };

  const failed = record.summary_status === 'failed';
  const regensUsed = record.summary_regeneration_count ?? 0;

  // Members read the frozen verified copy while the owner's newer changes are
  // unverified (never a summary that may not match its documents).
  const shownSummary = memberSnapshot ? memberSnapshot.summary ?? '' : summary;
  const shownAge = memberSnapshot
    ? memberSnapshot.patient_age == null ? '' : String(memberSnapshot.patient_age)
    : age;
  const shownSex = memberSnapshot ? memberSnapshot.patient_sex ?? '' : sex;
  const shownCancerType = memberSnapshot ? memberSnapshot.cancer_type ?? record.cancer_type ?? '' : record.cancer_type ?? '';
  // A snapshot always has content, so the spinner must not run over it.
  const isProcessing = !memberSnapshot && record.summary_status === 'processing';

  return (
    <View>
      <View style={styles.statusBox}>
        <Pill label={record.summary_status ?? 'processing'} active={record.summary_status === 'verified'} />
        <Text style={styles.muted}>Documents: {record.report_status ?? 'not ready'}</Text>
      </View>
      {failed && (
        <View style={styles.statusBox}>
          <Text style={styles.bodyText}>
            Processing failed
            {runState?.run?.error || runState?.run?.error_code
              ? `: ${runState.run.error ?? runState.run.error_code}`
              : '. Open the case and retry processing.'}
          </Text>
        </View>
      )}
      {memberSnapshot && (
        <View style={styles.statusBox}>
          <Text style={styles.label}>The owner has updated this case. The changes aren’t verified yet</Text>
          <Text style={styles.muted}>
            You’re viewing the last verified version
            {memberSnapshot.verified_at ? ` (verified ${formatVerifiedDate(memberSnapshot.verified_at)})` : ''}
            , including its documents. The update appears here once the owner verifies it.
          </Text>
        </View>
      )}
      <Text style={styles.sectionTitle}>Case details</Text>
      <View style={styles.twoCol}>
        <Field label="Case name" value={record.case_name} editable={false} />
        <Field label="Patient name" value={patientName} onChangeText={setPatientName} editable={editable} />
        <Field
          label="Patient age"
          value={shownAge}
          onChangeText={setAge}
          keyboardType="number-pad"
          placeholder="Not detected"
          editable={editable}
        />
        <Field
          label="Patient sex"
          value={shownSex}
          onChangeText={setSex}
          placeholder="Not detected"
          editable={editable}
        />
      </View>
      <Text style={styles.label}>Cancer type</Text>
      <Text style={styles.bodyText}>{shownCancerType || 'Not provided'}</Text>
      <Text style={styles.sectionTitle}>Case Summary</Text>
      {isProcessing ? (
        <Loading label="The case is being processed…" />
      ) : editing ? (
        <Field
          label="Summary (markdown)"
          value={summary}
          onChangeText={setSummary}
          multiline
          editable={editable}
          placeholder="Summary not available"
        />
      ) : (
        <Markdown style={markdownStyles}>{shownSummary || 'Summary not available'}</Markdown>
      )}
      {record.extra?.map((item) => (
        <View key={item.id} style={styles.cardPanel}>
          <Text style={styles.label}>{item.document_title}</Text>
          <Text style={styles.bodyText}>{item.document_data}</Text>
        </View>
      ))}
      {error ? <ErrorBox message={error} /> : null}
      {failed && editable && (
        <Button
          title={busy ? 'Retrying…' : 'Retry processing'}
          onPress={() => void retry()}
          disabled={busy}
        />
      )}
      {editable && !editing && !isProcessing && record.summary_status !== 'verified' && (
        <Button title="Edit summary" onPress={() => setEditing(true)} disabled={busy} />
      )}
      {editable && editing && (
        <>
          <Button
            title={busy ? 'Saving…' : 'Save changes'}
            onPress={() => void save()}
            disabled={busy || isProcessing}
          />
          <Button title="Save & Verify" secondary onPress={verify} disabled={busy} />
          <Button
            title={regensUsed >= 5 ? `Regeneration limit reached (${regensUsed}/5)` : `Regenerate Summary (${5 - regensUsed} left)`}
            secondary
            onPress={() => void regenerate()}
            disabled={busy || regensUsed >= 5 || isProcessing}
          />
          <Button title="Cancel" secondary onPress={cancelEdit} disabled={busy} />
        </>
      )}
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

function formatVerifiedDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}
