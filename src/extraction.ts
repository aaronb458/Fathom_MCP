import OpenAI from "openai";
import { TranscriptEntry, ExtractedItem } from "./types.js";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "openai/gpt-4o-mini";

const SYSTEM_PROMPT = `You are analyzing a meeting transcript. Extract the following:

1. ACTION ITEMS: specific tasks someone needs to do. Include who if their name is mentioned.
2. DECISIONS: things that were decided or agreed upon during the meeting.
3. FOLLOW-UPS: topics that need further discussion or were deferred.

For each item provide:
- type: "action_item" | "decision" | "follow_up"
- description: clear, specific, actionable text (1-2 sentences max)
- assignee: the person's name if identifiable from context (null if unclear or a group task)
- priority: "high" | "medium" | "low" based on urgency or importance discussed

Return ONLY a valid JSON array. No markdown, no explanation. Be specific and actionable — avoid vague items like "discuss further" unless that's literally what was agreed.

Example output:
[
  {"type": "action_item", "description": "Send the Q4 budget report to the finance team by Friday", "assignee": "Sarah", "priority": "high"},
  {"type": "decision", "description": "The team will use Slack instead of email for project updates", "assignee": null, "priority": "medium"},
  {"type": "follow_up", "description": "Revisit the hiring timeline once Q1 numbers are finalized", "assignee": null, "priority": "low"}
]`;

/**
 * Format transcript entries into readable text for the LLM.
 * Truncates to ~100K chars (~25K tokens) to stay within gpt-4o-mini limits.
 */
function formatTranscript(transcript: TranscriptEntry[], meetingTitle: string): string {
  let text = `Meeting: ${meetingTitle}\n\nTranscript:\n`;

  for (const entry of transcript) {
    const speaker = entry.speaker?.display_name || "Unknown";
    text += `[${entry.timestamp}] ${speaker}: ${entry.text}\n`;

    // Cap at ~100K chars to stay within token limits
    if (text.length > 100000) {
      text += "\n[Transcript truncated due to length]\n";
      break;
    }
  }

  return text;
}

/**
 * Extract action items, decisions, and follow-ups from a meeting transcript
 * using OpenAI gpt-4o-mini.
 *
 * Returns empty array if no OpenAI key or if extraction fails.
 */
export async function extractFromTranscript(
  transcript: TranscriptEntry[],
  meetingTitle: string,
  routerApiKey: string
): Promise<ExtractedItem[]> {
  if (!routerApiKey || transcript.length === 0) return [];

  const openai = new OpenAI({
    apiKey: routerApiKey,
    baseURL: OPENROUTER_BASE_URL,
  });
  const userMessage = formatTranscript(transcript, meetingTitle);

  try {
    const response = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return [];

    // Parse JSON — handle potential markdown code blocks
    const jsonStr = content.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
    const items: unknown[] = JSON.parse(jsonStr);

    // Validate and cast
    return items
      .filter((item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null && "type" in item && "description" in item
      )
      .map((item) => ({
        type: (["action_item", "decision", "follow_up"].includes(item.type as string)
          ? item.type
          : "action_item") as ExtractedItem["type"],
        description: String(item.description),
        assignee: item.assignee ? String(item.assignee) : null,
        priority: (["high", "medium", "low"].includes(item.priority as string)
          ? item.priority
          : "medium") as ExtractedItem["priority"],
      }));
  } catch (error) {
    console.error(`AI extraction failed for "${meetingTitle}":`, error instanceof Error ? error.message : error);
    return [];
  }
}
