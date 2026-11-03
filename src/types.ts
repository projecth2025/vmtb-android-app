export type Role = 'clinician' | 'site_data_coordinator' | 'mtb_expert';

export type Screen =
  | 'login' | 'signup' | 'otp' | 'forgot-phone' | 'forgot-otp' | 'forgot-password' | 'home'
  | 'cases' | 'archived' | 'case-create' | 'case-detail' | 'mtbs' | 'mtb-detail'
  | 'sample-case' | 'sample-board' | 'profile' | 'feedback' | 'verify-phone' | 'meeting-detail'
  | 'meeting-waiting' | 'meeting-live';

export type Profile = {
  whatsapp_verified: boolean | null;
  role: Role | null;
  full_name: string | null;
  profession?: string | null;
  hospital?: string | null;
  whatsapp_number?: string | null;
  avatar_key?: string | null;
  theme_preference?: 'light' | 'dark' | 'system' | null;
  linked_clinician_id?: string | null;
};

export type CaseStatus = 'processing' | 'unverified' | 'verified' | 'failed';

/** Frozen copy of the case written by the server when the owner verifies. */
export interface VerifiedSnapshot {
  summary?: string | null;
  patient_age?: number | null;
  patient_sex?: string | null;
  cancer_type?: string | null;
  notes?: { title?: string; content?: string } | null;
  verified_at?: string | null;
}

export interface CaseSummary {
  id: string;
  case_name: string;
  patient_name: string | null;
  patient_age: number | null;
  patient_sex: string | null;
  cancer_type: string | null;
  summary: string | null;
  summary_status: CaseStatus;
  report_status: 'not_ready' | 'unverified' | 'verified' | null;
  archived_at: string | null;
  created_at: string;
  content_generation?: number;
  summary_generation?: number;
  verified_generation?: number | null;
  summary_regeneration_count?: number;
  first_verified_at?: string | null;
  verified_snapshot?: VerifiedSnapshot | null;
  treatment_plan?: string | null;
  owner_id?: string;
  request_id?: string | null;
}

export interface MTB {
  id: string;
  name: string;
  owner_id: string;
  join_code: string;
  notification_enabled: boolean;
  case_ids: string[];
  member_count: number;
}

export interface CaseDocument {
  id: string;
  case_id: string;
  type: string | null;
  file_name: string;
  size: string | null;
  storage_path: string | null;
  created_at?: string;
}

export interface CaseQuestion {
  id: string;
  case_id: string;
  question_text: string;
  created_at: string;
}

export interface CaseOpinion {
  id: string;
  case_id: string;
  user_id: string;
  opinion_text: string;
  question_id: string | null;
  parent_id: string | null;
  mtb_id: string | null;
  created_at: string;
}

export interface CaseAdditionalDocument {
  id: string;
  case_id: string;
  document_title: string;
  document_data: string;
}

export interface CaseFollowUp {
  id: string;
  case_id: string;
  created_at: string;
  [key: string]: unknown;
}

export interface TreatmentPlan {
  id: string;
  case_id: string;
  vmtb_discussion_date?: string | null;
  participants?: string[] | null;
  consensus_predominant_pathway?: string | null;
  consensus_therapy_recommendation?: string | null;
  amp_level_of_evidence?: string | null;
  escat_level?: string | null;
  overall_evidence_strength?: string | null;
  is_treatment_implemented?: boolean | null;
  treatment_initiation_date?: string | null;
  treatment_discontinuation_date?: string | null;
  treatment_administered?: string | null;
  non_implementation_reason?: string | null;
  non_implementation_notes?: string | null;
  alternative_treatment_plan?: string | null;
}

export interface TreatmentFollowUp {
  id: string;
  treatment_plan_id: string;
  followup_date: string;
  disease_progression_date?: string | null;
  current_patient_status?: string | null;
  discontinuation_or_ltfu_reason?: string | null;
  additional_clinical_notes?: string | null;
}

export interface CaseDetail extends CaseSummary {
  documents: CaseDocument[];
  questions: CaseQuestion[];
  opinions: CaseOpinion[];
  followups: CaseFollowUp[];
  extra: CaseAdditionalDocument[];
  treatmentPlan: TreatmentPlan | null;
}

export interface MeetingSession {
  id: string;
  mtb_id: string;
  room_name?: string | null;
  started_at: string;
  ended_at?: string | null;
  total_duration_seconds?: number | null;
  max_participants?: number | null;
  status: 'active' | 'ended' | string;
  last_heartbeat?: string | null;
}

export interface MeetingTranscript {
  session_id?: string | null;
  meeting_id?: string | null;
  minutes_of_meeting?: string | null;
  mom_text?: string | null;
  status?: string | null;
}

/** Parameters handed from the MTB detail screen to the in-app meeting flow. */
export interface MeetingLaunch {
  room: string;
  ticket: string;
  mtbId: string;
  mtbName: string;
}

export interface RedactionStyleType {
  style: 'blur' | 'whiteout' | 'blackout';
}

export interface PickedCaseFile {
  name: string;
  uri: string;
  size: number;
  mimeType: string;
}

export interface ReportFile {
  filename: string;
  url: string;
}

export interface NavigationProps {
  onNavigate: (screen: Screen) => void;
  onBack: () => void;
  onOpenCase: (id: string, mtbId?: string | null) => void;
  onOpenMtb: (id: string) => void;
  onOpenMeeting?: (id: string) => void;
  onStartMeeting?: (launch: MeetingLaunch) => void;
}

export interface SessionUserProps {
  userId: string;
  userEmail?: string;
  role: Role;
  profile: Profile | null;
  effectiveOwnerId: string | null;
  onProfileChange: (profile: Profile) => void;
}

export interface FeatureScreenProps extends NavigationProps, SessionUserProps {
  screen: Screen;
  activeCaseId: string | null;
  activeMtbId: string | null;
  activeMeetingId?: string | null;
  meetingLaunch?: MeetingLaunch | null;
  setScreen?: (screen: Screen) => void;
}
