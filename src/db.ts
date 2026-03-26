import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { Meeting, TranscriptEntry, ActionItem, ExtractedItem } from "./types.js";

export class FathomDB {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const path = dbPath || process.env.DB_PATH || "./data/fathom.db";
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meetings (
        recording_id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        recorded_by_name TEXT,
        recorded_by_email TEXT,
        url TEXT,
        share_url TEXT,
        summary_markdown TEXT,
        attendees_json TEXT,
        webhook_received_at TEXT
      );

      CREATE TABLE IF NOT EXISTS transcripts (
        recording_id INTEGER PRIMARY KEY,
        transcript_json TEXT NOT NULL,
        stored_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS extracted_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recording_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        assignee TEXT,
        priority TEXT,
        extracted_at TEXT NOT NULL,
        FOREIGN KEY (recording_id) REFERENCES meetings(recording_id)
      );

      CREATE TABLE IF NOT EXISTS native_action_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recording_id INTEGER NOT NULL,
        description TEXT NOT NULL,
        assignee_name TEXT,
        assignee_email TEXT,
        completed INTEGER DEFAULT 0,
        recording_timestamp TEXT,
        FOREIGN KEY (recording_id) REFERENCES meetings(recording_id)
      );

      CREATE INDEX IF NOT EXISTS idx_extracted_recording ON extracted_items(recording_id);
      CREATE INDEX IF NOT EXISTS idx_extracted_type ON extracted_items(type);
      CREATE INDEX IF NOT EXISTS idx_extracted_assignee ON extracted_items(assignee);
      CREATE INDEX IF NOT EXISTS idx_native_recording ON native_action_items(recording_id);
    `);
  }

  saveMeeting(meeting: Meeting): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO meetings
        (recording_id, title, created_at, recorded_by_name, recorded_by_email, url, share_url, summary_markdown, attendees_json, webhook_received_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      meeting.recording_id,
      meeting.title,
      meeting.created_at,
      meeting.recorded_by.name,
      meeting.recorded_by.email,
      meeting.url,
      meeting.share_url,
      meeting.default_summary?.markdown_formatted ?? null,
      JSON.stringify(meeting.calendar_invitees),
      new Date().toISOString()
    );
  }

  saveTranscript(recordingId: number, transcript: TranscriptEntry[]): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO transcripts (recording_id, transcript_json, stored_at)
      VALUES (?, ?, ?)
    `).run(recordingId, JSON.stringify(transcript), new Date().toISOString());
  }

  saveNativeActionItems(recordingId: number, items: ActionItem[]): void {
    // Clear existing for this meeting (in case of re-processing)
    this.db.prepare("DELETE FROM native_action_items WHERE recording_id = ?").run(recordingId);

    const insert = this.db.prepare(`
      INSERT INTO native_action_items (recording_id, description, assignee_name, assignee_email, completed, recording_timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const tx = this.db.transaction((items: ActionItem[]) => {
      for (const item of items) {
        insert.run(
          recordingId,
          item.description,
          item.assignee?.name ?? null,
          item.assignee?.email ?? null,
          item.completed ? 1 : 0,
          item.recording_timestamp ?? null
        );
      }
    });

    tx(items);
  }

  saveExtractedItems(recordingId: number, items: ExtractedItem[]): void {
    // Clear existing for this meeting
    this.db.prepare("DELETE FROM extracted_items WHERE recording_id = ?").run(recordingId);

    const insert = this.db.prepare(`
      INSERT INTO extracted_items (recording_id, type, description, assignee, priority, extracted_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    const tx = this.db.transaction((items: ExtractedItem[]) => {
      for (const item of items) {
        insert.run(recordingId, item.type, item.description, item.assignee, item.priority, now);
      }
    });

    tx(items);
  }

  isProcessed(recordingId: number): boolean {
    const row = this.db.prepare(
      "SELECT COUNT(*) as count FROM extracted_items WHERE recording_id = ?"
    ).get(recordingId) as { count: number };
    return row.count > 0;
  }

  isEmpty(): boolean {
    const row = this.db.prepare("SELECT COUNT(*) as count FROM meetings").get() as { count: number };
    return row.count === 0;
  }

  getExtractedItems(options: {
    daysBack?: number;
    assignee?: string;
    type?: string;
  }): Array<{
    recording_id: number;
    meeting_title: string;
    meeting_date: string;
    items: ExtractedItem[];
  }> {
    const daysBack = options.daysBack ?? 7;
    const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

    let query = `
      SELECT e.*, m.title as meeting_title, m.created_at as meeting_date
      FROM extracted_items e
      JOIN meetings m ON e.recording_id = m.recording_id
      WHERE m.created_at >= ?
    `;
    const params: unknown[] = [cutoff];

    if (options.type) {
      query += " AND e.type = ?";
      params.push(options.type);
    }
    if (options.assignee) {
      query += " AND e.assignee LIKE ?";
      params.push(`%${options.assignee}%`);
    }

    query += " ORDER BY m.created_at DESC, e.id ASC";

    const rows = this.db.prepare(query).all(...params) as Array<{
      recording_id: number;
      type: string;
      description: string;
      assignee: string | null;
      priority: string | null;
      meeting_title: string;
      meeting_date: string;
    }>;

    // Group by meeting
    const groups = new Map<number, {
      recording_id: number;
      meeting_title: string;
      meeting_date: string;
      items: ExtractedItem[];
    }>();

    for (const row of rows) {
      if (!groups.has(row.recording_id)) {
        groups.set(row.recording_id, {
          recording_id: row.recording_id,
          meeting_title: row.meeting_title,
          meeting_date: row.meeting_date,
          items: [],
        });
      }
      groups.get(row.recording_id)!.items.push({
        type: row.type as ExtractedItem["type"],
        description: row.description,
        assignee: row.assignee,
        priority: (row.priority as ExtractedItem["priority"]) ?? "medium",
      });
    }

    return Array.from(groups.values());
  }

  getWeeklyBriefing(daysBack = 7): {
    meetings: Array<{
      recording_id: number;
      title: string;
      date: string;
      attendees: string[];
      summary_preview: string;
    }>;
    action_items: ExtractedItem[];
    decisions: ExtractedItem[];
    follow_ups: ExtractedItem[];
  } {
    const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

    // Get meetings
    const meetings = this.db.prepare(`
      SELECT recording_id, title, created_at, attendees_json, summary_markdown
      FROM meetings WHERE created_at >= ? ORDER BY created_at DESC
    `).all(cutoff) as Array<{
      recording_id: number;
      title: string;
      created_at: string;
      attendees_json: string | null;
      summary_markdown: string | null;
    }>;

    // Get all extracted items for the period
    const items = this.db.prepare(`
      SELECT e.type, e.description, e.assignee, e.priority
      FROM extracted_items e
      JOIN meetings m ON e.recording_id = m.recording_id
      WHERE m.created_at >= ?
      ORDER BY e.recording_id DESC, e.id ASC
    `).all(cutoff) as Array<{
      type: string;
      description: string;
      assignee: string | null;
      priority: string | null;
    }>;

    const action_items: ExtractedItem[] = [];
    const decisions: ExtractedItem[] = [];
    const follow_ups: ExtractedItem[] = [];

    for (const item of items) {
      const extracted: ExtractedItem = {
        type: item.type as ExtractedItem["type"],
        description: item.description,
        assignee: item.assignee,
        priority: (item.priority as ExtractedItem["priority"]) ?? "medium",
      };
      if (item.type === "action_item") action_items.push(extracted);
      else if (item.type === "decision") decisions.push(extracted);
      else if (item.type === "follow_up") follow_ups.push(extracted);
    }

    return {
      meetings: meetings.map((m) => {
        let attendees: string[] = [];
        try {
          const parsed = JSON.parse(m.attendees_json || "[]");
          attendees = parsed.map((a: { name: string; email: string }) => a.name || a.email);
        } catch { /* ignore */ }

        const preview = m.summary_markdown
          ? m.summary_markdown
              .split("\n")
              .filter((l: string) => l.trim().length > 0)
              .slice(0, 2)
              .map((l: string) => l.replace(/^#{1,4}\s*/, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim())
              .join(" | ")
          : "(no summary)";

        return {
          recording_id: m.recording_id,
          title: m.title,
          date: m.created_at,
          attendees,
          summary_preview: preview,
        };
      }),
      action_items,
      decisions,
      follow_ups,
    };
  }

  close(): void {
    this.db.close();
  }
}
