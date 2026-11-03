import { supabase } from '../supabase';
import { API_BASE, makeUuid } from './config';

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'superseded';
export type RunKind = 'initial' | 'edit' | 'regenerate' | 'retry';

export interface PipelineRun {
  id: string;
  case_id: string;
  generation: number;
  kind: RunKind;
  status: RunStatus;
  error_code: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

/** Returned by the `get_case_run_state` RPC — mirrors the web client's shape. */
export interface CaseRunState {
  content_generation: number;
  summary_generation: number;
  verified_generation: number | null;
  summary_status: 'processing' | 'unverified' | 'verified' | 'failed';
  report_status: string | null;
  archived_at: string | null;
  run: PipelineRun | null;
  replaced_runs: number;
}

const KNOWN_CODES = new Set([
  'NOT_AUTHENTICATED', 'NOT_OWNER', 'NOTHING_TO_SAVE', 'DOCUMENT_NOT_READY', 'DOCUMENT_NOT_FOUND',
  'DUPLICATE_DOCUMENT', 'INVALID_CHANGE', 'CASE_WOULD_BE_EMPTY', 'RUN_IN_PROGRESS', 'REGENERATION_LIMIT',
  'NOTHING_TO_RETRY', 'STALE_GENERATION', 'SUMMARY_NOT_READY', 'PATIENT_DETAILS_MISSING',
]);

/**
 * User-facing text for each pipeline failure code. Ported verbatim from the
 * web app's `describePipelineError` so both clients say the same thing.
 */
export function describePipelineError(code: string, detail: string | null = null): string {
  switch (code) {
    case 'NOT_AUTHENTICATED':
      return 'You were signed out. Sign in again to save your changes.';
    case 'NOT_OWNER':
      return 'Only the case owner can change this case.';
    case 'NOTHING_TO_SAVE':
      return 'These changes were already saved.';
    case 'DOCUMENT_NOT_READY':
      return `"${detail ?? 'This document'}" is still being processed. You can redact it once processing finishes.`;
    case 'DOCUMENT_NOT_FOUND':
      return `"${detail ?? 'This document'}" is no longer part of this case.`;
    case 'DUPLICATE_DOCUMENT':
      return `This case already has a document named "${detail ?? ''}". Rename the file or remove the existing document first.`;
    case 'INVALID_CHANGE':
      return 'One of the changes is invalid. Reload the case and try again.';
    case 'CASE_WOULD_BE_EMPTY':
      return 'This would leave the case with no documents or notes.';
    case 'RUN_IN_PROGRESS':
      return 'An update is already in progress. It will produce a new summary when it finishes.';
    case 'REGENERATION_LIMIT':
      return 'This case has reached its limit of 5 summary regenerations.';
    case 'NOTHING_TO_RETRY':
      return 'There is no failed update to retry.';
    case 'STALE_GENERATION':
      return 'This case changed since you opened it. Reload to see the latest version.';
    case 'SUMMARY_NOT_READY':
      return 'The updated summary isn’t ready yet. Wait for it to finish, then review it.';
    case 'PATIENT_DETAILS_MISSING':
      return 'Add the patient’s age and sex before verifying.';
    case 'NETWORK':
      return 'Couldn’t reach the server. Check your connection and try again.';
    default:
      return 'Something went wrong. Try again.';
  }
}

/** Turns any thrown value (RPC error, fetch failure, TypeError) into display text. */
export function mapPipelineError(error: unknown, fallback = 'Something went wrong. Try again.'): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const [code, ...rest] = raw.split(':');
  if (KNOWN_CODES.has(code)) return describePipelineError(code, rest.length ? rest.join(':') : null);
  if (/PGRST301|JWT|jwt expired|not authenticated/i.test(raw)) return describePipelineError('NOT_AUTHENTICATED');
  if (error instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(raw)) {
    return describePipelineError('NETWORK');
  }
  return raw || fallback;
}

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

/** Retry a failed run. Not counted against the 5-regeneration cap (server rule). */
export function retryCaseRun(caseId: string) {
  return startPipelineRun(caseId, 'retry');
}

/**
 * Reading this also expires stale runs server-side, so a run that died while
 * the app was closed shows up as `failed` instead of stuck in `processing`.
 */
export async function getCaseRunState(caseId: string): Promise<CaseRunState> {
  const { data, error } = await supabase.rpc('get_case_run_state', { p_case_id: caseId });
  if (error) throw error;
  const state = Array.isArray(data) ? data[0] : data;
  if (!state) throw new Error('Could not read this case’s status.');
  return state as CaseRunState;
}

/**
 * Kick off processing for a saved run. Retries briefly on 5xx/network errors
 * (web parity: 0 / 800 / 2400 ms); the run itself stays `pending` if this
 * ultimately fails, and `get_case_run_state` polling surfaces it for Retry.
 */
export async function triggerApplyRedactionChanges(runId: string) {
  let lastError: unknown = null;
  for (const delay of [0, 800, 2400]) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const response = await fetch(`${API_BASE}/trigger-apply-redaction-changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: runId }),
      });
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
      if (response.status < 500) break;
    } catch (err) {
      lastError = err;
    }
  }
  console.error('[pipeline] trigger failed for run', runId, lastError);
  throw new Error('Your changes are saved, but processing couldn’t be started.');
}

/**
 * Fallback used only during case creation: if the tracked `start_initial_run`
 * path fails after the `cases` row exists, fire the untracked converter
 * trigger (web parity) so the case still processes instead of erroring.
 */
export async function triggerConverterFilesToPng(requestId: string, caseId: string, additionalData: string) {
  const response = await fetch(`${API_BASE}/trigger-converter-files-to-png`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request_id: requestId, case_id: caseId, additional_data: additionalData }),
  });
  if (!response.ok) throw new Error(`Failed to start processing (${response.status}).`);
}
