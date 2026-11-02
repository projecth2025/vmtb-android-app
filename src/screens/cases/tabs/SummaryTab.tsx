import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { styles } from '../../../theme/styles';
import { CaseDetail } from '../../../types';
import { saveSummary } from '../../../lib/api/cases';
import { startPipelineRun } from '../../../lib/api/pipeline';
import { errorMessage } from '../../../lib/api/config';
import { Button, ErrorBox, Field, Loading, Pill } from '../../../components/ui';

export function SummaryTab({
  record,
  editable,
  onRefresh,
}: {
  record: CaseDetail;
  editable: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [summary, setSummary] = useState(record.summary ?? '');
  const [age, setAge] = useState(record.patient_age == null ? '' : String(record.patient_age));
  const [sex, setSex] = useState(record.patient_sex ?? '');
  const [patientName, setPatientName] = useState(record.patient_name ?? 'Anonymous');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSummary(record.summary ?? '');
    setAge(record.patient_age == null ? '' : String(record.patient_age));
    setSex(record.patient_sex ?? '');
    setPatientName(record.patient_name ?? 'Anonymous');
  }, [record]);

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
      Alert.alert(
        verify ? 'Case verified' : 'Changes saved',
        verify ? 'The current case summary is now verified.' : 'Your summary changes were saved.',
      );
    } catch (e) {
      setError(errorMessage(e, 'Could not save the summary.'));
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

  const regenerate = async () => {
    if ((record.summary_regeneration_count ?? 0) >= 5) {
      return setError('This case has reached its limit of 5 summary regenerations.');
    }
    setBusy(true);
    setError('');
    try {
      await startPipelineRun(record.id, 'regenerate');
      await onRefresh();
    } catch (e) {
      setError(errorMessage(e, 'Could not regenerate summary.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <View style={styles.statusBox}>
        <Pill label={record.summary_status ?? 'processing'} active={record.summary_status === 'verified'} />
        <Text style={styles.muted}>Documents: {record.report_status ?? 'not ready'}</Text>
      </View>
      <Text style={styles.sectionTitle}>Case details</Text>
      <View style={styles.twoCol}>
        <Field label="Case name" value={record.case_name} editable={false} />
        <Field label="Patient name" value={patientName} onChangeText={setPatientName} editable={editable} />
        <Field
          label="Patient age"
          value={age}
          onChangeText={setAge}
          keyboardType="number-pad"
          placeholder="Not detected"
          editable={editable}
        />
        <Field
          label="Patient sex"
          value={sex}
          onChangeText={setSex}
          placeholder="Not detected"
          editable={editable}
        />
      </View>
      <Text style={styles.label}>Cancer type</Text>
      <Text style={styles.bodyText}>{record.cancer_type || 'Not provided'}</Text>
      <Text style={styles.sectionTitle}>Case Summary</Text>
      {record.summary_status === 'processing' ? (
        <Loading label="The case is being processed…" />
      ) : (
        <Field
          label="Summary"
          value={summary}
          onChangeText={setSummary}
          multiline
          editable={editable}
          placeholder="Summary not available"
        />
      )}
      {record.extra?.map((item) => (
        <View key={item.id} style={styles.cardPanel}>
          <Text style={styles.label}>{item.document_title}</Text>
          <Text style={styles.bodyText}>{item.document_data}</Text>
        </View>
      ))}
      {error ? <ErrorBox message={error} /> : null}
      {editable && (
        <>
          <Button
            title={busy ? 'Saving…' : 'Save changes'}
            onPress={() => void save()}
            disabled={busy || record.summary_status === 'processing'}
          />
          {record.summary_status === 'unverified' && (
            <Button title="Save & Verify" secondary onPress={verify} disabled={busy} />
          )}
          <Button
            title="Regenerate Summary"
            secondary
            onPress={() => void regenerate()}
            disabled={busy || record.summary_status === 'processing'}
          />
        </>
      )}
    </View>
  );
}
