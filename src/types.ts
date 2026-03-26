// Fathom AI API response types — matched to real API (2026-03-25)

export interface Meeting {
  title: string;
  meeting_title: string;
  url: string;
  created_at: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  recording_id: number;
  recording_start_time: string;
  recording_end_time: string;
  calendar_invitees_domains_type: string;
  transcript: TranscriptEntry[] | null;
  transcript_language: string;
  default_summary: MeetingSummary | null;
  action_items: ActionItem[];
  calendar_invitees: CalendarInvitee[];
  recorded_by: RecordedBy;
  share_url: string;
  crm_matches: CrmMatch[] | null;
}

export interface MeetingSummary {
  template_name: string;
  markdown_formatted: string;
}

export interface TranscriptEntry {
  speaker: {
    display_name: string;
    matched_calendar_invitee_email: string | null;
  };
  text: string;
  timestamp: string; // "HH:MM:SS"
}

export interface ActionItem {
  text: string;
  assignee?: string;
}

export interface CalendarInvitee {
  name: string;
  email: string;
  email_domain: string;
  is_external: boolean;
  matched_speaker_display_name: string | null;
}

export interface RecordedBy {
  name: string;
  email: string;
  email_domain: string;
  team: string | null;
}

export interface CrmMatch {
  provider: string;
  entity_type: string;
  entity_id: string;
  entity_name: string;
}

export interface PaginatedResponse {
  items: Meeting[];
  next_cursor: string | null;
  limit: number;
}

export interface TranscriptResponse {
  transcript: TranscriptEntry[];
}

export interface SummaryResponse {
  summary: MeetingSummary;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
}

export interface Team {
  id: string;
  name: string;
}

export interface Webhook {
  id: string;
  destination_url: string;
  triggered_for: string[];
  include_transcript: boolean;
  include_summary: boolean;
  include_action_items: boolean;
  include_crm_matches: boolean;
}

export interface FathomError {
  status: number;
  message: string;
  rateLimitReset?: number;
}

// --- Smart layer types ---

export interface MeetingDigest {
  recording_id: number;
  title: string;
  date: string;
  duration_minutes: number;
  recorded_by: string;
  attendees: string[];
  summary_preview: string;
  action_items: string[];
  url: string;
}

export interface SearchResult {
  recording_id: number;
  meeting_title: string;
  meeting_date: string;
  score: number;
  matching_excerpts: string[];
  chunk_type: ChunkType;
  url: string;
}

export interface ActionItemGroup {
  recording_id: number;
  meeting_title: string;
  meeting_date: string;
  items: ActionItem[];
}

export type ChunkType = "summary" | "transcript" | "action_item" | "title";

export interface MeetingChunk {
  recording_id: number;
  meeting_title: string;
  meeting_date: string;
  chunk_type: ChunkType;
  speaker?: string;
  text: string;
}

export interface EmbeddedChunk extends MeetingChunk {
  embedding: number[];
}
