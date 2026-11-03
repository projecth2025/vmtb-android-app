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

/**
 * Opinions for the case, scoped to `mtbId` when given. Web parity: if an MTB
 * is selected but has no opinions of its own, fall back to the legacy rows
 * written before MTB scoping existed (`mtb_id IS NULL`).
 */
export async function fetchOpinions(caseId: string, mtbId: string | null): Promise<CaseOpinion[]> {
  let query = supabase.from('case_opinions').select('*').eq('case_id', caseId).order('created_at');
  if (mtbId) query = query.eq('mtb_id', mtbId);
  const { data, error } = await query;
  if (error) throw error;
  if (data?.length) return data;
  if (mtbId) {
    const { data: legacy, error: legacyError } = await supabase
      .from('case_opinions')
      .select('*')
      .eq('case_id', caseId)
      .is('mtb_id', null)
      .order('created_at');
    if (legacyError) throw legacyError;
    return legacy ?? [];
  }
  return [];
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
  questionId?: string | null;
}): Promise<CaseOpinion> {
  const { data, error } = await supabase
    .from('case_opinions')
    .insert({
      case_id: input.caseId,
      user_id: input.userId,
      opinion_text: input.text.trim(),
      question_id: input.questionId ?? null,
      parent_id: input.parentId,
      mtb_id: input.mtbId,
    })
    .select()
    .single();
  if (error) throw error;
  return data as CaseOpinion;
}

export async function updateOpinion(opinionId: string, text: string): Promise<void> {
  const { error } = await supabase
    .from('case_opinions')
    .update({ opinion_text: text.trim() })
    .eq('id', opinionId);
  if (error) throw error;
}
