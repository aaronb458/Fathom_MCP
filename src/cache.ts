import { Meeting, TranscriptResponse } from "./types.js";
import { FathomClient } from "./api.js";

interface DateRange {
  after: string;
  before: string;
  fetchedAt: number;
}

const TTL_MS = 5 * 60 * 1000; // 5 minutes

export class MeetingCache {
  private meetings: Map<number, Meeting> = new Map(); // keyed by recording_id
  private fetchedRanges: DateRange[] = [];
  private client: FathomClient;

  constructor(client: FathomClient) {
    this.client = client;
  }

  /**
   * Get meetings for a date range. Fetches from API if not cached or stale.
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
  async getMeetingDetail(recordingId: number, includeTranscript: boolean): Promise<Meeting | null> {
    let meeting = this.meetings.get(recordingId);

    // If not cached, try fetching recent meetings
    if (!meeting) {
      await this.fetchRange(
        new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        new Date().toISOString()
      );
      meeting = this.meetings.get(recordingId);
    }

    if (!meeting) return null;

    // Lazy-load transcript if requested and not already cached
    if (includeTranscript && !meeting.transcript) {
      try {
        const response = await this.client.getTranscript(recordingId);
        meeting.transcript = (response as TranscriptResponse).transcript ?? [];
        this.meetings.set(recordingId, meeting);
      } catch {
        // Transcript may not be available — don't crash
        meeting.transcript = [];
      }
    }

    return meeting;
  }

  /**
   * Get all cached meetings.
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
      // Preserve any transcript we already loaded
      const existing = this.meetings.get(meeting.recording_id);
      if (existing?.transcript && !meeting.transcript) {
        meeting.transcript = existing.transcript;
      }
      this.meetings.set(meeting.recording_id, meeting);
    }

    this.fetchedRanges.push({ after, before, fetchedAt: Date.now() });
  }
}
