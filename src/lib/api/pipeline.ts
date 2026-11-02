import { supabase } from '../supabase';
import { API_BASE, makeUuid } from './config';

export async function startPipelineRun(caseId: string, kind: 'initial' | 'regenerate' | 'retry' | 'edit' = 'initial') {
  const sessionId = makeUuid();
  const rpcName =
    kind === 'regenerate' ? 'start_regeneration' :
    kind === 'retry' ? 'retry_case_run' :
    'start_initial_run';
  const { data, error } = await supabase.rpc(rpcName, { p_case_id: caseId, p_session_id: sessionId });
  if (error) throw error;
  const run = Array.isArray(data) ? data[0] : data;
  if (run?.id) await triggerApplyRedactionChanges(run.id);
  return run;
}

export async function triggerApplyRedactionChanges(runId: string) {
  const response = await fetch(`${API_BASE}/trigger-apply-redaction-changes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ run_id: runId }),
  });
  if (!response.ok) {
    throw new Error('Document processing could not be started. Open the case and retry processing.');
  }
}
