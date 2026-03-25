// Fathom AI API response types

export interface Meeting {
  id: string;
  title: string;
  created_at: string;
  duration_seconds: number;
  recorded_by: {
    id: string;
    name: string;
    email: string;
  };
  calendar_invitees: Array<{
    name: string;
    email: string;
  }>;
  teams: Array<{
    id: string;
    name: string;
  }>;
  transcript?: TranscriptEntry[];
  summary?: SummarySection[];
  action_items?: ActionItem[];
  crm_matches?: CrmMatch[];
}

export interface PaginatedResponse<T> {
  results: T[];
  has_more: boolean;
  cursor?: string;
}

export interface TranscriptEntry {
  speaker: string;
  start_time: number;
  end_time: number;
  text: string;
}

export interface SummarySection {
  title: string;
  bullets: string[];
}

export interface ActionItem {
  text: string;
  assignee?: string;
}

export interface CrmMatch {
  provider: string;
  entity_type: string;
  entity_id: string;
  entity_name: string;
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
