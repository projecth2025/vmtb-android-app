import { supabase } from '../supabase';
import { TreatmentFollowUp, TreatmentPlan } from '../../types';

export async function fetchTreatmentPlan(caseId: string): Promise<TreatmentPlan | null> {
  const { data, error } = await supabase
    .from('case_treatment_plans')
    .select('*')
    .eq('case_id', caseId)
    .maybeSingle();
  if (error) throw error;
  return (data as TreatmentPlan) ?? null;
}

export async function saveTreatmentPlan(caseId: string, values: Partial<TreatmentPlan>): Promise<void> {
  const existing = await fetchTreatmentPlan(caseId);
  const payload = { case_id: caseId, ...values };
  const result = existing
    ? await supabase.from('case_treatment_plans').update(payload).eq('id', existing.id)
    : await supabase.from('case_treatment_plans').insert(payload);
  if (result.error) throw result.error;
}

export async function fetchTreatmentFollowUps(treatmentPlanId: string): Promise<TreatmentFollowUp[]> {
  const { data, error } = await supabase
    .from('case_treatment_followups')
    .select('*')
    .eq('treatment_plan_id', treatmentPlanId)
    .order('followup_date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addTreatmentFollowUp(values: {
  id?: string;
  treatment_plan_id: string;
  followup_date: string;
  disease_progression_date?: string | null;
  current_patient_status?: string | null;
  discontinuation_or_ltfu_reason?: string | null;
  additional_clinical_notes?: string | null;
}): Promise<void> {
  const { id, ...payload } = values;
  const result = id
    ? await supabase.from('case_treatment_followups').update(payload).eq('id', id)
    : await supabase.from('case_treatment_followups').insert(payload);
  if (result.error) throw result.error;
}

export async function deleteTreatmentFollowUp(id: string): Promise<void> {
  const { error } = await supabase.from('case_treatment_followups').delete().eq('id', id);
  if (error) throw error;
}
