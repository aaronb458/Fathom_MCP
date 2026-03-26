import { FathomError, Meeting, PaginatedResponse } from "./types.js";

const BASE_URL = "https://api.fathom.ai/external/v1";

export class FathomClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async request<T>(
    method: string,
    path: string,
    params?: Record<string, string | string[] | boolean | undefined>,
    body?: unknown
  ): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === false) continue;
        if (Array.isArray(value)) {
          for (const v of value) {
            url.searchParams.append(key, v);
          }
        } else if (typeof value === "boolean") {
          url.searchParams.set(key, "true");
        } else {
          url.searchParams.set(key, value);
        }
      }
    }

    const headers: Record<string, string> = {
      "X-Api-Key": this.apiKey,
      "Accept": "application/json",
    };

    if (body) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error: FathomError = {
        status: response.status,
        message: `Fathom API error: ${response.status} ${response.statusText}`,
      };

      if (response.status === 429) {
        const resetHeader = response.headers.get("RateLimit-Reset");
        if (resetHeader) {
          error.rateLimitReset = parseInt(resetHeader, 10);
          error.message += ` — Rate limited. Retry after ${resetHeader} seconds.`;
        }
      }

      try {
        const body = await response.json();
        if (body.message || body.error) {
          error.message = `Fathom API error ${response.status}: ${body.message || body.error}`;
        }
      } catch {
        // Response body wasn't JSON, keep default message
      }

      throw error;
    }

    // DELETE returns 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  // Meetings
  async listMeetings(params: {
    created_after?: string;
    created_before?: string;
    "recorded_by[]"?: string[];
    "teams[]"?: string[];
    "calendar_invitees_domains[]"?: string[];
    cursor?: string;
    include_transcript?: boolean;
    include_summary?: boolean;
    include_action_items?: boolean;
    include_crm_matches?: boolean;
  }) {
    return this.request("GET", "/meetings", params as Record<string, string | string[] | boolean | undefined>);
  }

  // Summary
  async getSummary(recordingId: string) {
    return this.request("GET", `/recordings/${recordingId}/summary`);
  }

  // Transcript
  async getTranscript(recordingId: string) {
    return this.request("GET", `/recordings/${recordingId}/transcript`);
  }

  // Team Members
  async listTeamMembers(params: { team?: string; cursor?: string }) {
    return this.request("GET", "/team_members", params as Record<string, string | undefined>);
  }

  // Teams
  async listTeams(params: { cursor?: string }) {
    return this.request("GET", "/teams", params as Record<string, string | undefined>);
  }

  // Webhooks
  async createWebhook(body: {
    destination_url: string;
    triggered_for: string[];
    include_transcript?: boolean;
    include_summary?: boolean;
    include_action_items?: boolean;
    include_crm_matches?: boolean;
  }) {
    return this.request("POST", "/webhooks", undefined, body);
  }

  async deleteWebhook(webhookId: string) {
    return this.request("DELETE", `/webhooks/${webhookId}`);
  }

  /**
   * Fetch ALL meetings in a date range, auto-paginating through all pages.
   * Always includes summaries and action items (small payloads).
   */
  async listAllMeetings(params: {
    created_after?: string;
    created_before?: string;
    "recorded_by[]"?: string[];
    "teams[]"?: string[];
    include_summary?: boolean;
    include_action_items?: boolean;
  }): Promise<Meeting[]> {
    const all: Meeting[] = [];
    let cursor: string | undefined;

    do {
      const page = await this.request<PaginatedResponse<Meeting>>(
        "GET",
        "/meetings",
        {
          ...params,
          cursor,
        } as Record<string, string | string[] | boolean | undefined>
      );
      all.push(...page.results);
      cursor = page.has_more ? page.cursor : undefined;
    } while (cursor);

    return all;
  }
}
