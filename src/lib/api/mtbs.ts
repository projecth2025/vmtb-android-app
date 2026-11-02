import { supabase } from '../supabase';
import { MTB, Role } from '../../types';
import { randomJoinCode } from './config';
import { fetchCases } from './cases';

export async function fetchMTBs(userId: string, role: Role, linkedClinicianId: string | null): Promise<MTB[]> {
  const ownerId = role === 'site_data_coordinator' ? linkedClinicianId : userId;
  const ownedQuery = ownerId
    ? supabase.from('mtbs').select('*').eq('owner_id', ownerId)
    : Promise.resolve({ data: [], error: null } as { data: unknown[]; error: null });
  const [ownedResult, membershipResult] = await Promise.all([
    ownedQuery,
    supabase.from('mtb_members').select('mtb_id').eq('user_id', userId),
  ]);
  if (ownedResult.error) throw ownedResult.error;
  if (membershipResult.error) throw membershipResult.error;
  const memberIds = (membershipResult.data ?? []).map((row: { mtb_id: string }) => row.mtb_id);
  const memberResult = memberIds.length
    ? await supabase.from('mtbs').select('*').in('id', memberIds)
    : { data: [], error: null } as { data: unknown[]; error: null };
  if (memberResult.error) throw memberResult.error;
  const boards = [...new Map(
    [...(ownedResult.data ?? []), ...(memberResult.data ?? [])].map((board: any) => [board.id, board]),
  ).values()] as any[];

  return Promise.all(
    boards.map(async (board) => {
      const [members, shares] = await Promise.all([
        supabase.from('mtb_members').select('id', { count: 'exact', head: true }).eq('mtb_id', board.id),
        supabase.from('mtb_cases').select('case_id').eq('mtb_id', board.id),
      ]);
      if (shares.error) throw shares.error;
      return {
        id: board.id,
        name: board.name,
        owner_id: board.owner_id,
        join_code: board.join_code,
        notification_enabled: board.notification_enabled ?? true,
        case_ids: (shares.data ?? []).map((row: { case_id: string }) => row.case_id),
        member_count: (members.count ?? 0) + 1,
      } as MTB;
    }),
  );
}

export async function createMTB(name: string, ownerId: string): Promise<MTB> {
  const { data, error } = await supabase
    .from('mtbs')
    .insert({ owner_id: ownerId, name: name.trim(), join_code: randomJoinCode() })
    .select()
    .single();
  if (error) throw error;
  return data as MTB;
}

export async function joinMTB(code: string) {
  const { error } = await supabase.rpc('join_mtb_by_code', { p_join_code: code.trim().toUpperCase() });
  if (error) throw error;
}

export async function fetchMtbBoard(mtbId: string) {
  const { data, error } = await supabase.from('mtbs').select('*').eq('id', mtbId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This MTB is no longer available.');
  return data;
}

export async function fetchMtbCaseIds(mtbId: string): Promise<string[]> {
  const { data, error } = await supabase.from('mtb_cases').select('case_id').eq('mtb_id', mtbId);
  if (error) throw error;
  return (data ?? []).map((row: { case_id: string }) => row.case_id);
}

export async function addCaseToMtb(mtbId: string, caseId: string) {
  const { error } = await supabase.from('mtb_cases').insert({ mtb_id: mtbId, case_id: caseId });
  if (error) throw error;
}

export async function removeCaseFromMtb(mtbId: string, caseId: string) {
  const { error } = await supabase.from('mtb_cases').delete().eq('mtb_id', mtbId).eq('case_id', caseId);
  if (error) throw error;
}

export async function renameMtb(mtbId: string, name: string, ownerId: string) {
  const { error } = await supabase
    .from('mtbs')
    .update({ name: name.trim() })
    .eq('id', mtbId)
    .eq('owner_id', ownerId);
  if (error) throw error;
}

export async function leaveMtb(mtbId: string, userId: string) {
  const { error } = await supabase
    .from('mtb_members')
    .delete()
    .eq('mtb_id', mtbId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function setMtbNotifications(mtbId: string, enabled: boolean) {
  const { error } = await supabase.from('mtbs').update({ notification_enabled: enabled }).eq('id', mtbId);
  if (error) throw error;
}

export async function fetchAvailableCasesForMtb(userId: string, role: Role, linkedClinicianId: string | null, sharedIds: string[]) {
  const ownCases = await fetchCases(userId, role, linkedClinicianId);
  return ownCases.filter((item) => item.summary_status === 'verified' && !item.archived_at && !sharedIds.includes(item.id));
}

export async function fetchMtbSharedCases(caseIds: string[]) {
  if (!caseIds.length) return [];
  const { data, error } = await supabase
    .from('cases_viewer_safe')
    .select('*')
    .in('id', caseIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchOwnedMtbBoards(ownerId: string | null): Promise<{ id: string; name: string }[]> {
  if (!ownerId) return [];
  const { data, error } = await supabase
    .from('mtbs')
    .select('id, name')
    .eq('owner_id', ownerId)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function fetchCaseMtbIdsLocal(caseId: string): Promise<string[]> {
  const { data, error } = await supabase.from('mtb_cases').select('mtb_id').eq('case_id', caseId);
  if (error) throw error;
  return (data ?? []).map((row: { mtb_id: string }) => row.mtb_id);
}
