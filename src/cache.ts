import { Meeting, PaginatedResponse } from "./types.js";
import { FathomClient } from "./api.js";

interface DateRange {
  after: string; // ISO 8601
  before: string; // ISO 8601
  fetchedAt: number; // Date.now()
}

const TTL_MS = 5 * 60 * 1000; // 5 minutes

export class MeetingCache {
  private meetings: Map<string, Meeting> = new Map();
  private fetchedRanges: DateRange[] = [];
  private client: FathomClient;

  constructor(client: FathomClient) {
    this.client = client;
  }

  /**
   * Get meetings for a date range. Fetches from API if not cached or stale.
   * Always includes summaries and action items. Never bulk-fetches transcripts.
   */
  async getForRange(daysBack: number): Promise<Meeting[]> {
    const now = new Date();
    const after = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000).toISOString();
    const before = now.toISOString();

    if (!this.isCovered(after, before)) {
      await this.fetchRange(after, before);
    }

    return this.getMeetingsInRange(after, before);
  }

  /**
   * Get a single meeting with full detail (transcript loaded on demand).
   */
  async getMeetingDetail(meetingId: string, includeTranscript: boolean): Promise<Meeting | null> {
    let meeting = this.meetings.get(meetingId);

    // If not cached at all, try to fetch recent meetings
    if (!meeting) {
      await this.fetchRange(
        new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        new Date().toISOString()
      );
      meeting = this.meetings.get(meetingId);
    }

    if (!meeting) return null;

    // Lazy-load transcript if requested and not already cached
    if (includeTranscript && !meeting.transcript) {
      const transcript = await this.client.getTranscript(meetingId);
      meeting.transcript = (transcript as { entries: Meeting["transcript"] }).entries ?? transcript as unknown as Meeting["transcript"];
      this.meetings.set(meetingId, meeting);
    }

    return meeting;
  }

  /**
   * Get all cached meetings (for search across everything loaded so far).
   */
  getAllCached(): Meeting[] {
    return Array.from(this.meetings.values());
  }

  private isCovered(after: string, before: string): boolean {
    const afterTime = new Date(after).getTime();
    const beforeTime = new Date(before).getTime();
    const now = Date.now();

    return this.fetchedRanges.some(
      (r) =>
        new Date(r.after).getTime() <= afterTime &&
        new Date(r.before).getTime() >= beforeTime &&
        now - r.fetchedAt < TTL_MS
    );
  }

  private getMeetingsInRange(after: string, before: string): Meeting[] {
    const afterTime = new Date(after).getTime();
    const beforeTime = new Date(before).getTime();

    return Array.from(this.meetings.values()).filter((m) => {
      const created = new Date(m.created_at).getTime();
      return created >= afterTime && created <= beforeTime;
    });
  }

  private async fetchRange(after: string, before: string): Promise<void> {
    const allMeetings = await this.client.listAllMeetings({
      created_after: after,
      created_before: before,
      include_summary: true,
      include_action_items: true,
    });

    for (const meeting of allMeetings) {
      // Merge: preserve any transcript we already loaded
      const existing = this.meetings.get(meeting.id);
      if (existing?.transcript && !meeting.transcript) {
        meeting.transcript = existing.transcript;
      }
      this.meetings.set(meeting.id, meeting);
    }

    this.fetchedRanges.push({
      after,
      before,
      fetchedAt: Date.now(),
    });
  }
}
