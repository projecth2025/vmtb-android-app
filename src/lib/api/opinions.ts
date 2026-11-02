import { supabase } from '../supabase';
import { CaseOpinion, CaseQuestion } from '../../types';

export async function fetchQuestions(caseId: string): Promise<CaseQuestion[]> {
  const { data, error } = await supabase
    .from('case_questions')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at');
  if (error) throw error;
  return data ?? [];
}

export async function fetchOpinions(caseId: string, mtbId: string | null): Promise<CaseOpinion[]> {
  let query = supabase.from('case_opinions').select('*').eq('case_id', caseId).order('created_at');
  if (mtbId) query = query.eq('mtb_id', mtbId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchCaseMtbIds(caseId: string): Promise<string[]> {
  const { data, error } = await supabase.from('mtb_cases').select('mtb_id').eq('case_id', caseId);
  if (error) throw error;
  return (data ?? []).map((row: { mtb_id: string }) => row.mtb_id);
}

export async function submitQuestion(caseId: string, text: string) {
  const { error } = await supabase.from('case_questions').insert({ case_id: caseId, question_text: text.trim() });
  if (error) throw error;
}

export async function submitOpinion(input: {
  caseId: string;
  userId: string;
  text: string;
  mtbId: string;
  parentId: string | null;
}): Promise<CaseOpinion> {
  const { data, error } = await supabase
    .from('case_opinions')
    .insert({
      case_id: input.caseId,
      user_id: input.userId,
      opinion_text: input.text.trim(),
      question_id: null,
      parent_id: input.parentId,
      mtb_id: input.mtbId,
    })
    .select()
    .single();
  if (error) throw error;
  return data as CaseOpinion;
}
