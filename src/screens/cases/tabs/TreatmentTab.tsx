import { useCallback, useEffect, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { styles } from '../../../theme/styles';
import { CaseDetail, TreatmentFollowUp, TreatmentPlan } from '../../../types';
import {
  addTreatmentFollowUp,
  fetchTreatmentFollowUps,
  fetchTreatmentPlan,
  saveTreatmentPlan,
} from '../../../lib/api/treatment';
import { errorMessage } from '../../../lib/api/config';
import { Button, ErrorBox, Field, Loading, Pill } from '../../../components/ui';

export function TreatmentTab({ record, editable }: { record: CaseDetail; editable: boolean }) {
  const [plan, setPlan] = useState<TreatmentPlan | null>(null);
  const [discussionDate, setDiscussionDate] = useState(new Date().toISOString().slice(0, 10));
  const [recommendation, setRecommendation] = useState('');
  const [pathway, setPathway] = useState('');
  const [evidence, setEvidence] = useState('');
  const [implemented, setImplemented] = useState(false);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [followups, setFollowups] = useState<TreatmentFollowUp[]>([]);
  const [followupDate, setFollowupDate] = useState(new Date().toISOString().slice(0, 10));
  const [progressionDate, setProgressionDate] = useState('');
  const [patientStatus, setPatientStatus] = useState('Alive');
  const [followupNotes, setFollowupNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const value = await fetchTreatmentPlan(record.id);
      setPlan(value);
      if (value) {
        setDiscussionDate(value.vmtb_discussion_date ?? new Date().toISOString().slice(0, 10));
        setRecommendation(value.consensus_therapy_recommendation ?? '');
        setPathway(value.consensus_predominant_pathway ?? '');
        setEvidence(value.overall_evidence_strength ?? '');
        setImplemented(value.is_treatment_implemented ?? false);
        setReason(value.non_implementation_reason ?? '');
        setNotes(value.alternative_treatment_plan ?? value.non_implementation_notes ?? '');
        setFollowups(await fetchTreatmentFollowUps(value.id));
      } else {
        setFollowups([]);
      }
      setError('');
    } catch (e) {
      setError(errorMessage(e, 'Could not load the treatment plan.'));
    } finally {
      setLoading(false);
    }
  }, [record.id]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!editable) return;
    if (!implemented && !reason.trim()) {
      return setError('Add a reason if the recommended treatment was not implemented.');
    }
    setError('');
    try {
      await saveTreatmentPlan(record.id, {
        vmtb_discussion_date: discussionDate,
        consensus_predominant_pathway: pathway || null,
        consensus_therapy_recommendation: recommendation || null,
        overall_evidence_strength: evidence || null,
        is_treatment_implemented: implemented,
        non_implementation_reason: implemented ? null : reason,
        alternative_treatment_plan: implemented ? null : notes,
      });
      Alert.alert('Treatment plan saved');
      await load();
    } catch (e) {
      setError(errorMessage(e, 'Could not save the treatment plan.'));
    }
  };

  const addFollowup = async () => {
    if (!plan?.id) return setError('Save a treatment plan before adding follow-ups.');
    if (!followupDate) return setError('Follow-up date is required.');
    try {
      await addTreatmentFollowUp({
        treatment_plan_id: plan.id,
        followup_date: followupDate,
        disease_progression_date: progressionDate || null,
        current_patient_status: patientStatus,
        additional_clinical_notes: followupNotes || null,
      });
      setFollowupDate(new Date().toISOString().slice(0, 10));
      setProgressionDate('');
      setFollowupNotes('');
      await load();
    } catch (e) {
      setError(errorMessage(e, 'Could not add the follow-up.'));
    }
  };

  if (loading) return <Loading label="Loading treatment plan…" />;

  return (
    <View>
      <Text style={styles.sectionTitle}>Treatment plan</Text>
      <Field label="MTB discussion date (YYYY-MM-DD)" value={discussionDate} onChangeText={setDiscussionDate} editable={editable} />
      <Field label="Predominant pathway" value={pathway} onChangeText={setPathway} editable={editable} placeholder="e.g. targeted therapy" />
      <Field label="Therapy recommendation" value={recommendation} onChangeText={setRecommendation} editable={editable} multiline />
      <Field label="Overall evidence strength" value={evidence} onChangeText={setEvidence} editable={editable} />
      <View style={styles.rowBetween}>
        <Text style={styles.bodyText}>Treatment implemented</Text>
        <Switch value={implemented} onValueChange={setImplemented} disabled={!editable} />
      </View>
      {!implemented && (
        <>
          <Field label="Reason not implemented" value={reason} onChangeText={setReason} editable={editable} />
          <Field label="Alternative treatment plan" value={notes} onChangeText={setNotes} editable={editable} multiline />
        </>
      )}
      {editable && <Button title="Save treatment plan" onPress={() => void save()} />}
      <Text style={styles.sectionTitle}>Follow-ups</Text>
      {followups.map((item) => (
        <View key={item.id} style={styles.cardPanel}>
          <Text style={styles.cardTitle}>Follow-up · {item.followup_date}</Text>
          {item.disease_progression_date ? (
            <Text style={styles.bodyText}>Disease progression: {item.disease_progression_date}</Text>
          ) : null}
          <Text style={styles.bodyText}>Patient status: {item.current_patient_status}</Text>
          {item.additional_clinical_notes ? (
            <Text style={styles.bodyText}>{item.additional_clinical_notes}</Text>
          ) : null}
        </View>
      ))}
      {editable && (
        <>
          <Field label="Follow-up date (YYYY-MM-DD)" value={followupDate} onChangeText={setFollowupDate} />
          <Field label="Disease progression date (optional)" value={progressionDate} onChangeText={setProgressionDate} />
          <Text style={styles.label}>Current patient status</Text>
          <View style={styles.row}>
            {(['Alive', 'Deceased'] as const).map((value) => (
              <Pill key={value} label={value} active={patientStatus === value} onPress={() => setPatientStatus(value)} />
            ))}
          </View>
          <Field label="Additional clinical notes" value={followupNotes} onChangeText={setFollowupNotes} multiline />
          <Button title="Add follow-up" secondary onPress={() => void addFollowup()} />
        </>
      )}
      {error ? <ErrorBox message={error} /> : null}
    </View>
  );
}
