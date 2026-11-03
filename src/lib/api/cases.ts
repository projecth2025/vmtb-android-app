import { supabase } from '../supabase';
import { CaseSummary, CaseDetail, Role, PickedCaseFile } from '../../types';
import { getUploadConfig, uploadFile } from './uploads';
import { startPipelineRun, triggerConverterFilesToPng } from './pipeline';

export async function fetchCases(
  userId: string,
  role: Role,
  linkedClinicianId: string | null,
  archived = false,
): Promise<CaseSummary[]> {
  if (role === 'mtb_expert') {
    const { data: membership, error: membershipError } = await supabase
      .from('mtb_members')
      .select('mtb_id')
      .eq('user_id', userId);
    if (membershipError) throw membershipError;
    const mtbIds = (membership ?? []).map((row: { mtb_id: string }) => row.mtb_id);
    if (mtbIds.length === 0) return [];
    const { data: shares, error: shareError } = await supabase
      .from('mtb_cases')
      .select('case_id')
      .in('mtb_id', mtbIds);
    if (shareError) throw shareError;
    const caseIds = [...new Set((shares ?? []).map((row: { case_id: string }) => row.case_id))];
    if (caseIds.length === 0) return [];
    const { data, error } = await supabase
      .from('cases_viewer_safe')
      .select('*')
      .in('id', caseIds)
      .is('archived_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as CaseSummary[];
  }

  const ownerId = role === 'site_data_coordinator' ? linkedClinicianId : userId;
  if (!ownerId) return [];
  const query = supabase
    .from('cases')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });
  const { data, error} = archived
    ? await query.not('archived_at', 'is', null)
    : await query.is('archived_at', null);
  if (error) throw error;
  return (data ?? []) as CaseSummary[];
}

export async function fetchCase(caseId: string, mtbId: string | null = null): Promise<CaseDetail> {
  const opinionsQuery = supabase.from('case_opinions').select('*').eq('case_id', caseId).order('created_at');
  const [{ data: row, error }, documents, questions, opinions, followups, extra, treatment] = await Promise.all([
    supabase.from('cases_viewer_safe').select('*').eq('id', caseId).maybeSingle(),
    supabase.from('case_documents').select('*').eq('case_id', caseId).order('created_at'),
    supabase.from('case_questions').select('*').eq('case_id', caseId).order('created_at'),
    mtbId ? opinionsQuery.eq('mtb_id', mtbId) : opinionsQuery,
    supabase.from('case_follow_ups').select('*').eq('case_id', caseId).order('created_at', { ascending: false }),
    supabase.from('case_additional_documents').select('*').eq('case_id', caseId),
    supabase.from('case_treatment_plans').select('*').eq('case_id', caseId).maybeSingle(),
  ]);
  for (const result of [documents, questions, opinions, followups, extra, treatment]) {
    if (result.error) throw result.error;
  }
  if (error) throw error;
  if (!row) throw new Error('This case is no longer available.');
  return {
    ...(row as CaseSummary),
    documents: documents.data ?? [],
    questions: questions.data ?? [],
    opinions: opinions.data ?? [],
    followups: followups.data ?? [],
    extra: extra.data ?? [],
    treatmentPlan: (treatment.data as CaseDetail['treatmentPlan']) ?? null,
  };
}

export async function createAndProcessCase(input: {
  ownerId: string;
  patientName: string;
  cancerType: string;
  abbreviation: string;
  explanation: string;
  files: PickedCaseFile[];
  sample?: boolean;
}): Promise<string | null> {
  if (input.sample) return null;
  if (!input.files.length && !input.explanation.trim()) {
    throw new Error('Add at least one document or explain the case before creating it.');
  }
  const upload = await getUploadConfig();
  for (const file of input.files) await uploadFile(file, upload);
  const { data: generatedName, error: nameError } = await supabase.rpc('generate_case_name', {
    p_abbreviation: input.abbreviation,
  });
  if (nameError) throw nameError;
  const { data: row, error: insertError } = await supabase
    .from('cases')
    .insert({
      owner_id: input.ownerId,
      case_name: generatedName,
      patient_name: input.patientName.trim() || 'Anonymous',
      patient_age: null,
      patient_sex: null,
      cancer_type: input.cancerType,
      summary: null,
      summary_status: 'processing',
      request_id: upload.requestId,
    })
    .select()
    .single();
  if (insertError) throw insertError;

  if (input.files.length) {
    const { error } = await supabase.from('case_documents').insert(
      input.files.map((file) => ({
        case_id: row.id,
        type: 'Clinical',
        file_name: file.name,
        size: `${(file.size / 1024).toFixed(2)} KB`,
        storage_path: `${upload.prefix}${file.name}`,
      })),
    );
    if (error) throw error;
  }
  if (input.explanation.trim()) {
    const { error } = await supabase.from('case_additional_documents').insert({
      case_id: row.id,
      document_title: 'Case Explanation',
      document_data: input.explanation.trim(),
    });
    if (error) throw error;
  }
  // The case exists from here on. A pipeline-start failure must not surface as
  // "Could not create the case" (web parity) — users would retry and create
  // duplicates. Fall back to the untracked converter trigger, and only fail
  // loudly if even that cannot start processing.
  try {
    await startPipelineRun(row.id, 'initial');
  } catch (e) {
    console.error('[cases] start_initial_run failed, falling back to converter trigger', e);
    try {
      await triggerConverterFilesToPng(upload.requestId, row.id, input.explanation.trim());
    } catch (fallbackError) {
      throw new Error('The case was created, but processing could not be started. Open the case and retry.');
    }
  }
  return row.id as string;
}

export async function archiveCase(caseId: string) {
  const { data, error } = await supabase.rpc('archive_case', { p_case_id: caseId });
  if (error) throw error;
  if (!data) throw new Error('Only the case owner can archive this case.');
}

export async function restoreCase(caseId: string) {
  const { data, error } = await supabase.rpc('restore_case', { p_case_id: caseId });
  if (error) throw error;
  if (!data || (Array.isArray(data) && data.length === 0)) {
    throw new Error('Only the case owner can restore this case.');
  }
}

export async function saveSummary(
  caseId: string,
  generation: number,
  summary: string,
  age: number | null,
  sex: string | null,
  patientName: string | null,
  cancerType: string,
  verify = false,
) {
  const { data, error } = await supabase.rpc('save_case_summary_edit', {
    p_case_id: caseId,
    p_generation: generation,
    p_summary: summary,
    p_patient_name: patientName,
    p_patient_age: age,
    p_patient_sex: sex ?? '',
    p_cancer_type: cancerType,
    p_verify: verify,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function deleteCaseCascade(caseId: string) {
  const steps = [
    supabase.from('case_opinions').delete().eq('case_id', caseId),
    supabase.from('case_questions').delete().eq('case_id', caseId),
    supabase.from('case_documents').delete().eq('case_id', caseId),
    supabase.from('case_additional_documents').delete().eq('case_id', caseId),
    supabase.from('case_follow_ups').delete().eq('case_id', caseId),
    supabase.from('case_treatment_plans').delete().eq('case_id', caseId),
    supabase.from('mtb_cases').delete().eq('case_id', caseId),
  ];
  const results = await Promise.all(steps);
  const failure = results.find((result) => result.error)?.error;
  if (failure) throw failure;
  const result = await supabase.from('cases').delete().eq('id', caseId);
  if (result.error) throw result.error;
}
