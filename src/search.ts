import {
  Meeting,
  MeetingDigest,
  SearchResult,
  ActionItemGroup,
} from "./types.js";

/**
 * Extract plain text lines from Fathom's markdown summary.
 * Strips markdown headings, links, and formatting.
 */
function extractSummaryLines(markdown: string): string[] {
  return markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) =>
      line
        .replace(/^#{1,4}\s*/, "") // strip headings
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [text](url) -> text
        .trim()
    )
    .filter((line) => line.length > 0);
}

/**
 * Get a short preview from markdown summary (~first 3 meaningful lines).
 */
function summaryPreview(markdown: string, maxLines = 3): string {
  const lines = extractSummaryLines(markdown);
  return lines.slice(0, maxLines).join(" | ");
}

/**
 * Calculate meeting duration from recording start/end times.
 */
function durationMinutes(meeting: Meeting): number {
  const start = new Date(meeting.recording_start_time).getTime();
  const end = new Date(meeting.recording_end_time).getTime();
  return Math.round((end - start) / 60000);
}

/**
 * Case-insensitive keyword search across meeting titles, summaries, and action items.
 */
export function keywordSearch(
  meetings: Meeting[],
  query: string,
  searchTranscripts = false
): SearchResult[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const results: SearchResult[] = [];

  for (const meeting of meetings) {
    const matches: { text: string; type: SearchResult["chunk_type"]; score: number }[] = [];

    // Search title
    if (!meeting.title) continue;
    const titleLower = meeting.title.toLowerCase();
    const titleScore = terms.filter((t) => titleLower.includes(t)).length;
    if (titleScore > 0) {
      matches.push({ text: meeting.title, type: "title", score: titleScore });
    }

    // Search summary (markdown)
    if (meeting.default_summary?.markdown_formatted) {
      const lines = extractSummaryLines(meeting.default_summary.markdown_formatted);
      for (const line of lines) {
        const lineLower = line.toLowerCase();
        const lineScore = terms.filter((t) => lineLower.includes(t)).length;
        if (lineScore > 0) {
          matches.push({ text: line, type: "summary", score: lineScore });
        }
      }
    }

    // Search action items
    for (const item of meeting.action_items || []) {
      if (!item?.text) continue;
      const itemLower = item.text.toLowerCase();
      const itemScore = terms.filter((t) => itemLower.includes(t)).length;
      if (itemScore > 0) {
        matches.push({
          text: item.assignee ? `[${item.assignee}] ${item.text}` : item.text,
          type: "action_item",
          score: itemScore,
        });
      }
    }

    // Search transcripts (only if loaded and requested)
    if (searchTranscripts && meeting.transcript) {
      for (const entry of meeting.transcript) {
        const entryLower = entry.text.toLowerCase();
        const entryScore = terms.filter((t) => entryLower.includes(t)).length;
        if (entryScore > 0) {
          matches.push({
            text: `[${entry.speaker.display_name}] ${entry.text}`,
            type: "transcript",
            score: entryScore,
          });
        }
      }
    }

    if (matches.length > 0) {
      matches.sort((a, b) => b.score - a.score);
      const topMatches = matches.slice(0, 5);
      const totalScore = topMatches.reduce((sum, m) => sum + m.score, 0);

      results.push({
        recording_id: meeting.recording_id,
        meeting_title: meeting.title,
        meeting_date: meeting.created_at,
        score: totalScore,
        matching_excerpts: topMatches.map((m) => m.text),
        chunk_type: topMatches[0].type,
        url: meeting.url,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 10);
}

/**
 * Compress meetings into a token-efficient digest.
 */
export function buildDigest(meetings: Meeting[]): MeetingDigest[] {
  return meetings
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((m) => ({
      recording_id: m.recording_id,
      title: m.title,
      date: m.created_at,
      duration_minutes: durationMinutes(m),
      recorded_by: m.recorded_by.name,
      attendees: m.calendar_invitees.map((i) => i.name || i.email),
      summary_preview: m.default_summary?.markdown_formatted
        ? summaryPreview(m.default_summary.markdown_formatted)
        : "(no summary)",
      action_items: (m.action_items || []).map((a) =>
        a.assignee ? `[${a.assignee}] ${a.text}` : a.text
      ),
      url: m.url,
    }));
}

/**
 * Extract action items from meetings, grouped by meeting.
 */
export function extractActionItems(
  meetings: Meeting[],
  assigneeFilter?: string
): ActionItemGroup[] {
  const filterLower = assigneeFilter?.toLowerCase();

  return meetings
    .filter((m) => m.action_items?.length > 0)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((m) => {
      let items = m.action_items || [];
      if (filterLower) {
        items = items.filter(
          (a) => a.assignee && a.assignee.toLowerCase().includes(filterLower)
        );
      }
      return {
        recording_id: m.recording_id,
        meeting_title: m.title,
        meeting_date: m.created_at,
        items,
      };
    })
    .filter((g) => g.items.length > 0);
}
