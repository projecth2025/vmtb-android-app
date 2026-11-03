import { useCallback, useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { styles } from '../../../theme/styles';
import { CaseDetail, TreatmentFollowUp } from '../../../types';
import {
  addTreatmentFollowUp,
  deleteTreatmentFollowUp,
  fetchTreatmentFollowUps,
  fetchTreatmentPlan,
  saveTreatmentPlan,
} from '../../../lib/api/treatment';
import { errorMessage } from '../../../lib/api/config';
import { Button, ErrorBox, Field, FormModal, Loading, Pill } from '../../../components/ui';

/** Exact option sets from the web app's TreatmentPlanFollowUp. */
const NON_IMPLEMENTATION_REASONS = [
  { value: 'low_evidence', label: 'Low level of evidence' },
  { value: 'similar_agent', label: 'Used similar agent' },
  { value: 'cost', label: 'Cost constraints' },
  { value: 'patient_unfit', label: 'Patient unfit for therapy' },
  { value: 'alternative_soc', label: 'Alternative standard of care exists' },
  { value: 'other', label: 'Other' },
];

const AMP_OPTIONS = [
  'Tier I - Level A',
  'Tier I - Level B',
  'Tier II - Level C',
  'Tier II - Level D',
  'Tier III',
  'Tier IV',
];

const ESCAT_OPTIONS = ['ESCAT I', 'ESCAT II', 'ESCAT III', 'ESCAT IV', 'ESCAT X'];

const EVIDENCE_OPTIONS = ['Strong', 'Moderate', 'Weak', 'Insufficient'];

const today = () => new Date().toISOString().slice(0, 10);

export function TreatmentTab({ record, editable }: { record: CaseDetail; editable: boolean }) {
  const [planId, setPlanId] = useState<string | null>(null);
  const [hasPlan, setHasPlan] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Section 1 — vMTB discussion details
  const [discussionDate, setDiscussionDate] = useState(today());
  const [participants, setParticipants] = useState<string[]>([]);
  const [participantInput, setParticipantInput] = useState('');
  const [pathway, setPathway] = useState('');
  const [recommendation, setRecommendation] = useState('');

  // Section 2 — evidence evaluation
  const [amp, setAmp] = useState('');
  const [escat, setEscat] = useState('');
  const [evidence, setEvidence] = useState('');

  // Section 3 — treatment outcome
  const [implemented, setImplemented] = useState<boolean | null>(null);
  const [initiationDate, setInitiationDate] = useState('');
  const [discontinuationDate, setDiscontinuationDate] = useState('');
  const [administered, setAdministered] = useState('');
  const [reason, setReason] = useState('');
  const [otherText, setOtherText] = useState('');
  const [alternativePlan, setAlternativePlan] = useState('');

  // Follow-ups
  const [followups, setFollowups] = useState<TreatmentFollowUp[]>([]);
  const [fuModal, setFuModal] = useState(false);
  const [editingFuId, setEditingFuId] = useState<string | null>(null);
  const [fuBusy, setFuBusy] = useState(false);
  const [fuDate, setFuDate] = useState(today());
  const [fuProgression, setFuProgression] = useState('');
  const [fuStatus, setFuStatus] = useState('');
  const [fuReason, setFuReason] = useState('');
  const [fuNotes, setFuNotes] = useState('');

  // A plan that doesn't exist yet opens straight into edit mode for the owner.
  const isEditing = editable && (editing || !hasPlan);

  const load = useCallback(async () => {
    try {
      const value = await fetchTreatmentPlan(record.id);
      setHasPlan(!!value);
      setPlanId(value?.id ?? null);
      if (value) {
        // 'other:<text>' is how the web stores a custom non-implementation reason.
        const stored = value.non_implementation_reason ?? '';
        const isOther = stored.startsWith('other:');
        setDiscussionDate(value.vmtb_discussion_date ?? today());
        setParticipants(value.participants ?? []);
        setPathway(value.consensus_predominant_pathway ?? '');
        setRecommendation(value.consensus_therapy_recommendation ?? '');
        setAmp(value.amp_level_of_evidence ?? '');
        setEscat(value.escat_level ?? '');
        setEvidence(value.overall_evidence_strength ?? '');
        setImplemented(value.is_treatment_implemented ?? null);
        setInitiationDate(value.treatment_initiation_date ?? '');
        setDiscontinuationDate(value.treatment_discontinuation_date ?? '');
        setAdministered(value.treatment_administered ?? '');
        setReason(isOther ? 'other' : stored);
        setOtherText(isOther ? stored.slice('other:'.length) : '');
        setAlternativePlan(value.alternative_treatment_plan ?? value.non_implementation_notes ?? '');
        setFollowups(await fetchTreatmentFollowUps(value.id));
      } else {
        setParticipants([]);
        setImplemented(null);
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

  const cancelEdit = () => {
    setError('');
    setEditing(false);
    void load();
  };

  const save = async () => {
    if (!editable || saving) return;
    // Validation messages verbatim from the web client.
    if (!discussionDate) return setError('vMTB Discussion Date is required');
    if (implemented === null) return setError('Please select whether treatment was implemented');
    if (implemented === false) {
      if (!reason) return setError('Please select a reason for non-implementation');
      if (reason === 'other' && !otherText.trim()) return setError('Please specify the reason for "Other"');
    }
    setSaving(true);
    setError('');
    try {
      const reasonToStore = reason === 'other' && otherText ? `other:${otherText}` : reason;
      await saveTreatmentPlan(record.id, {
        vmtb_discussion_date: discussionDate,
        participants: participants.length ? participants : null,
        consensus_predominant_pathway: pathway || null,
        consensus_therapy_recommendation: recommendation || null,
        amp_level_of_evidence: amp || null,
        escat_level: escat || null,
        overall_evidence_strength: evidence || null,
        is_treatment_implemented: implemented,
        treatment_initiation_date: initiationDate || null,
        treatment_discontinuation_date: discontinuationDate || null,
        treatment_administered: implemented ? administered || null : null,
        non_implementation_reason: !implemented ? reasonToStore || null : null,
        non_implementation_notes: null,
        alternative_treatment_plan: !implemented ? alternativePlan || null : null,
      });
      Alert.alert('Treatment plan saved');
      setEditing(false);
      await load();
    } catch (e) {
      setError(errorMessage(e, 'Failed to save treatment plan'));
    } finally {
      setSaving(false);
    }
  };

  const addParticipant = () => {
    const trimmed = participantInput.trim();
    if (!trimmed) return;
    if (!participants.includes(trimmed)) setParticipants((prev) => [...prev, trimmed]);
    setParticipantInput('');
  };

  const openAddFollowUp = () => {
    setEditingFuId(null);
    setFuDate(today());
    setFuProgression('');
    setFuStatus('');
    setFuReason('');
    setFuNotes('');
    setFuModal(true);
  };

  const openEditFollowUp = (item: TreatmentFollowUp) => {
    setEditingFuId(item.id);
    setFuDate(item.followup_date || today());
    setFuProgression(item.disease_progression_date ?? '');
    setFuStatus(item.current_patient_status ?? '');
    setFuReason(item.discontinuation_or_ltfu_reason ?? '');
    setFuNotes(item.additional_clinical_notes ?? '');
    setFuModal(true);
  };

  const saveFollowUp = async () => {
    if (!planId || fuBusy) return;
    if (!fuDate) return setError('Follow-up date is required');
    setFuBusy(true);
    setError('');
    try {
      await addTreatmentFollowUp({
        id: editingFuId ?? undefined,
        treatment_plan_id: planId,
        followup_date: fuDate,
        disease_progression_date: fuProgression || null,
        current_patient_status: fuStatus || null,
        discontinuation_or_ltfu_reason: fuReason || null,
        additional_clinical_notes: fuNotes || null,
      });
      setFuModal(false);
      await load();
    } catch (e) {
      setError(errorMessage(e, 'Failed to save follow-up'));
    } finally {
      setFuBusy(false);
    }
  };

  const confirmDeleteFollowUp = (item: TreatmentFollowUp) => {
    Alert.alert(
      'Delete Follow-Up',
      'Are you sure you want to delete this follow-up? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTreatmentFollowUp(item.id);
              await load();
            } catch (e) {
              setError(errorMessage(e, 'Failed to delete follow-up'));
            }
          },
        },
      ],
    );
  };

  if (loading) return <Loading label="Loading treatment plan…" />;

  const selectRow = (
    label: string,
    options: string[],
    value: string,
    onChange: (next: string) => void,
  ) => (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.filterRow}>
        {options.map((option) => (
          <Pill
            key={option}
            label={option}
            active={value === option}
            onPress={isEditing ? () => onChange(value === option ? '' : option) : undefined}
            disabled={!isEditing}
          />
        ))}
      </View>
    </View>
  );

  return (
    <View>
      <View style={styles.rowBetween}>
        <Text style={styles.sectionTitle}>Treatment plan</Text>
        {editable && hasPlan && !isEditing && (
          <Pill label="Edit" onPress={() => setEditing(true)} />
        )}
        {isEditing && hasPlan && (
          <View style={styles.row}>
            <Pill label="Cancel" onPress={cancelEdit} disabled={saving} />
            <Pill label={saving ? 'Saving…' : 'Save'} active onPress={() => void save()} disabled={saving} />
          </View>
        )}
      </View>

      <Text style={styles.label}>Section 1: vMTB Discussion Details</Text>
      <Field
        label="vMTB Discussion Date (YYYY-MM-DD) *"
        value={discussionDate}
        onChangeText={setDiscussionDate}
        editable={isEditing}
        placeholder="YYYY-MM-DD"
      />
      <Text style={styles.label}>Participants</Text>
      <View style={styles.filterRow}>
        {participants.map((person) => (
          <Pill
            key={person}
            label={person}
            active
            onPress={isEditing ? () => setParticipants((prev) => prev.filter((p) => p !== person)) : undefined}
            disabled={!isEditing}
          />
        ))}
      </View>
      {isEditing && (
        <View style={styles.row}>
          <Field
            label="Add participant"
            value={participantInput}
            onChangeText={setParticipantInput}
            placeholder="e.g. Dr. Rao"
          />
          <Pill label="Add" onPress={addParticipant} />
        </View>
      )}
      <Field
        label="Consensus predominant pathway"
        value={pathway}
        onChangeText={setPathway}
        editable={isEditing}
        multiline
        placeholder="e.g. targeted therapy"
      />
      <Field
        label="Consensus therapy recommendation"
        value={recommendation}
        onChangeText={setRecommendation}
        editable={isEditing}
        multiline
      />

      <Text style={styles.label}>Section 2: Evidence Evaluation</Text>
      {selectRow('AMP Level of Evidence', AMP_OPTIONS, amp, setAmp)}
      {selectRow('ESCAT Level', ESCAT_OPTIONS, escat, setEscat)}
      {selectRow('Overall Evidence Strength', EVIDENCE_OPTIONS, evidence, setEvidence)}

      <Text style={styles.label}>Section 3: Treatment Outcome</Text>
      <Text style={styles.muted}>Was the recommended treatment implemented?</Text>
      <View style={styles.filterRow}>
        <Pill
          label="Yes"
          active={implemented === true}
          onPress={isEditing ? () => setImplemented(true) : undefined}
          disabled={!isEditing}
        />
        <Pill
          label="No"
          active={implemented === false}
          onPress={isEditing ? () => setImplemented(false) : undefined}
          disabled={!isEditing}
        />
      </View>

      {implemented === true && (
        <>
          <Field
            label="Date of treatment initiation (YYYY-MM-DD)"
            value={initiationDate}
            onChangeText={setInitiationDate}
            editable={isEditing}
            placeholder="YYYY-MM-DD"
          />
          <Field
            label="Date of treatment discontinuation (optional, YYYY-MM-DD)"
            value={discontinuationDate}
            onChangeText={setDiscontinuationDate}
            editable={isEditing}
            placeholder="YYYY-MM-DD"
          />
          <Field
            label="Treatment administered"
            value={administered}
            onChangeText={setAdministered}
            editable={isEditing}
            multiline
            placeholder="Describe the treatment administered…"
          />
        </>
      )}

      {implemented === false && (
        <>
          <Text style={styles.label}>Reason for non-implementation</Text>
          <View style={styles.filterRow}>
            {NON_IMPLEMENTATION_REASONS.map((option) => (
              <Pill
                key={option.value}
                label={option.label}
                active={reason === option.value}
                onPress={isEditing ? () => {
                  setReason(option.value);
                  if (option.value !== 'other') setOtherText('');
                } : undefined}
                disabled={!isEditing}
              />
            ))}
          </View>
          {reason === 'other' && (
            <Field
              label="Please specify"
              value={otherText}
              onChangeText={setOtherText}
              editable={isEditing}
              placeholder="Please specify…"
            />
          )}
          <Field
            label="Alternative treatment plan used"
            value={alternativePlan}
            onChangeText={setAlternativePlan}
            editable={isEditing}
            multiline
            placeholder="Describe alternative treatment…"
          />
          <Field
            label="Date of treatment initiation in clinical practice (YYYY-MM-DD)"
            value={initiationDate}
            onChangeText={setInitiationDate}
            editable={isEditing}
            placeholder="YYYY-MM-DD"
          />
          <Field
            label="Date of treatment discontinuation (optional, YYYY-MM-DD)"
            value={discontinuationDate}
            onChangeText={setDiscontinuationDate}
            editable={isEditing}
            placeholder="YYYY-MM-DD"
          />
        </>
      )}

      {isEditing && (
        <View style={styles.row}>
          <Button title={saving ? 'Saving…' : 'Save'} onPress={() => void save()} disabled={saving} />
          {hasPlan && <Button title="Cancel" secondary onPress={cancelEdit} disabled={saving} />}
        </View>
      )}

      <Text style={styles.sectionTitle}>Follow-ups</Text>
      {editable && hasPlan && (
        <Button title="Add follow-up" secondary onPress={openAddFollowUp} disabled={fuBusy} />
      )}
      {!hasPlan ? (
        <Text style={styles.muted}>
          {editable ? 'Save the treatment plan first to add follow-ups.' : 'No treatment plan exists yet.'}
        </Text>
      ) : followups.length === 0 ? (
        <Text style={styles.muted}>No follow-ups documented yet.</Text>
      ) : (
        followups.map((item) => (
          <View key={item.id} style={styles.cardPanel}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>Follow-up · {item.followup_date}</Text>
              {editable && (
                <View style={styles.row}>
                  <Pill label="Edit" onPress={() => openEditFollowUp(item)} disabled={fuBusy} />
                  <Pill label="Delete" onPress={() => confirmDeleteFollowUp(item)} disabled={fuBusy} />
                </View>
              )}
            </View>
            {item.disease_progression_date ? (
              <Text style={styles.bodyText}>Disease progression: {item.disease_progression_date}</Text>
            ) : null}
            {item.current_patient_status ? (
              <Text style={styles.bodyText}>Patient status: {item.current_patient_status}</Text>
            ) : null}
            {item.discontinuation_or_ltfu_reason ? (
              <Text style={styles.bodyText}>Discontinuation/LTFU: {item.discontinuation_or_ltfu_reason}</Text>
            ) : null}
            {item.additional_clinical_notes ? (
              <Text style={styles.bodyText}>{item.additional_clinical_notes}</Text>
            ) : null}
          </View>
        ))
      )}

      {error ? <ErrorBox message={error} /> : null}

      <FormModal
        visible={fuModal}
        title={editingFuId ? 'Edit Follow-Up' : 'Add Follow-Up'}
        onClose={() => setFuModal(false)}
      >
        <Field label="Follow-up date (YYYY-MM-DD) *" value={fuDate} onChangeText={setFuDate} placeholder="YYYY-MM-DD" />
        <Field
          label="Disease progression date"
          value={fuProgression}
          onChangeText={setFuProgression}
          placeholder="YYYY-MM-DD"
        />
        <Text style={styles.label}>Current patient status</Text>
        <View style={styles.filterRow}>
          {['', 'Alive', 'Deceased'].map((value) => (
            <Pill
              key={value || 'none'}
              label={value || 'Select…'}
              active={fuStatus === value}
              onPress={() => setFuStatus(value)}
            />
          ))}
        </View>
        <Field label="Reason for discontinuation / LTFU" value={fuReason} onChangeText={setFuReason} />
        <Field label="Additional notes" value={fuNotes} onChangeText={setFuNotes} multiline />
        <View style={styles.row}>
          <Button title="Cancel" secondary onPress={() => setFuModal(false)} disabled={fuBusy} />
          <Button
            title={fuBusy ? 'Saving…' : editingFuId ? 'Update' : 'Add'}
            onPress={() => void saveFollowUp()}
            disabled={fuBusy}
          />
        </View>
      </FormModal>
    </View>
  );
}
