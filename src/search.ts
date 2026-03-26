import {
  Meeting,
  MeetingDigest,
  SearchResult,
  ActionItemGroup,
} from "./types.js";

/**
 * Case-insensitive keyword search across meeting titles, summaries, and action items.
 * Returns results ranked by number of matches.
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
    const titleLower = meeting.title.toLowerCase();
    const titleScore = terms.filter((t) => titleLower.includes(t)).length;
    if (titleScore > 0) {
      matches.push({ text: meeting.title, type: "title", score: titleScore });
    }

    // Search summary bullets
    if (meeting.summary) {
      for (const section of meeting.summary) {
        for (const bullet of section.bullets) {
          const bulletLower = bullet.toLowerCase();
          const bulletScore = terms.filter((t) => bulletLower.includes(t)).length;
          if (bulletScore > 0) {
            matches.push({
              text: `[${section.title}] ${bullet}`,
              type: "summary",
              score: bulletScore,
            });
          }
        }
      }
    }

    // Search action items
    if (meeting.action_items) {
      for (const item of meeting.action_items) {
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
    }

    // Search transcripts (only if loaded and requested)
    if (searchTranscripts && meeting.transcript) {
      for (const entry of meeting.transcript) {
        const entryLower = entry.text.toLowerCase();
        const entryScore = terms.filter((t) => entryLower.includes(t)).length;
        if (entryScore > 0) {
          matches.push({
            text: `[${entry.speaker}] ${entry.text}`,
            type: "transcript",
            score: entryScore,
          });
        }
      }
    }

    if (matches.length > 0) {
      // Take top 5 excerpts by score
      matches.sort((a, b) => b.score - a.score);
      const topMatches = matches.slice(0, 5);
      const totalScore = topMatches.reduce((sum, m) => sum + m.score, 0);

      results.push({
        meeting_id: meeting.id,
        meeting_title: meeting.title,
        meeting_date: meeting.created_at,
        score: totalScore,
        matching_excerpts: topMatches.map((m) => m.text),
        chunk_type: topMatches[0].type,
      });
    }
  }

  // Sort by relevance score descending
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 10);
}

/**
 * Compress meetings into a token-efficient digest.
 * ~200-500 tokens per meeting instead of full transcript.
 */
export function buildDigest(meetings: Meeting[]): MeetingDigest[] {
  return meetings
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((m) => {
      // Top 3 summary bullets
      const topBullets: string[] = [];
      if (m.summary) {
        for (const section of m.summary) {
          for (const bullet of section.bullets) {
            if (topBullets.length < 3) {
              topBullets.push(`[${section.title}] ${bullet}`);
            }
          }
        }
      }

      return {
        meeting_id: m.id,
        title: m.title,
        date: m.created_at,
        duration_minutes: Math.round(m.duration_seconds / 60),
        recorded_by: m.recorded_by.name,
        attendees: m.calendar_invitees.map((i) => i.name || i.email),
        top_bullets: topBullets,
        action_items: (m.action_items || []).map((a) =>
          a.assignee ? `[${a.assignee}] ${a.text}` : a.text
        ),
      };
    });
}

/**
 * Extract action items from meetings, grouped by meeting.
 * Optionally filter by assignee name (case-insensitive partial match).
 */
export function extractActionItems(
  meetings: Meeting[],
  assigneeFilter?: string
): ActionItemGroup[] {
  const filterLower = assigneeFilter?.toLowerCase();

  return meetings
    .filter((m) => m.action_items && m.action_items.length > 0)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((m) => {
      let items = m.action_items!;
      if (filterLower) {
        items = items.filter(
          (a) => a.assignee && a.assignee.toLowerCase().includes(filterLower)
        );
      }
      return {
        meeting_id: m.id,
        meeting_title: m.title,
        meeting_date: m.created_at,
        items,
      };
    })
    .filter((g) => g.items.length > 0);
}
