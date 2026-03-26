import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { MeetingCache } from "./cache.js";
import { EmbeddingStore } from "./embeddings.js";
import { buildDigest, keywordSearch, extractActionItems } from "./search.js";

export function registerPrompts(
  server: Server,
  cache: MeetingCache,
  embeddings: EmbeddingStore
) {
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: "weekly-digest",
        description:
          "Get a compressed digest of all meetings from a given week. Perfect for weekly reviews or catching up.",
        arguments: [
          {
            name: "week_offset",
            description:
              "0 = this week, -1 = last week, -2 = two weeks ago (default: 0)",
            required: false,
          },
        ],
      },
      {
        name: "meeting-search",
        description:
          "Search across meetings for a specific topic, decision, or keyword.",
        arguments: [
          {
            name: "query",
            description: "What to search for",
            required: true,
          },
          {
            name: "days_back",
            description: "How many days back to search (default: 30)",
            required: false,
          },
        ],
      },
      {
        name: "action-items",
        description:
          "Extract all action items from recent meetings, optionally filtered by who they're assigned to.",
        arguments: [
          {
            name: "days_back",
            description: "How many days back to look (default: 7)",
            required: false,
          },
          {
            name: "assignee",
            description: "Filter by assignee name (optional)",
            required: false,
          },
        ],
      },
    ],
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: promptArgs } = request.params;

    switch (name) {
      case "weekly-digest": {
        const offset = parseInt(promptArgs?.week_offset || "0", 10);
        const now = new Date();
        const dayOfWeek = now.getDay();
        const startOfThisWeek = new Date(now);
        startOfThisWeek.setDate(now.getDate() - dayOfWeek + (offset * 7));
        startOfThisWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfThisWeek);
        endOfWeek.setDate(startOfThisWeek.getDate() + 7);

        const daysBack = Math.ceil(
          (Date.now() - startOfThisWeek.getTime()) / (24 * 60 * 60 * 1000)
        );
        const meetings = await cache.getForRange(Math.max(daysBack, 7));

        // Filter to the specific week
        const weekMeetings = meetings.filter((m) => {
          const d = new Date(m.created_at).getTime();
          return d >= startOfThisWeek.getTime() && d < endOfWeek.getTime();
        });

        const digest = buildDigest(weekMeetings);

        const weekLabel =
          offset === 0
            ? "this week"
            : offset === -1
              ? "last week"
              : `${Math.abs(offset)} weeks ago`;

        return {
          messages: [
            {
              role: "user" as const,
              content: {
                type: "text" as const,
                text: `Here is a digest of ${digest.length} meetings from ${weekLabel}. Please summarize the key themes, decisions, and action items:\n\n${JSON.stringify(digest, null, 2)}`,
              },
            },
          ],
        };
      }

      case "meeting-search": {
        const query = promptArgs?.query || "";
        const daysBack = parseInt(promptArgs?.days_back || "30", 10);

        const meetings = await cache.getForRange(daysBack);

        let resultsJson: string;
        if (embeddings.isAvailable()) {
          await embeddings.addMeetings(meetings);
          const results = await embeddings.search(query);
          resultsJson = JSON.stringify(results, null, 2);
        } else {
          const results = keywordSearch(meetings, query);
          resultsJson = JSON.stringify(results, null, 2);
        }

        return {
          messages: [
            {
              role: "user" as const,
              content: {
                type: "text" as const,
                text: `I searched for "${query}" across ${meetings.length} meetings from the last ${daysBack} days. Here are the results. Please analyze them and highlight the most relevant findings:\n\n${resultsJson}`,
              },
            },
          ],
        };
      }

      case "action-items": {
        const daysBack = parseInt(promptArgs?.days_back || "7", 10);
        const assignee = promptArgs?.assignee;

        const meetings = await cache.getForRange(daysBack);
        const groups = extractActionItems(meetings, assignee);

        const filterDesc = assignee
          ? `assigned to "${assignee}"`
          : "for all assignees";

        return {
          messages: [
            {
              role: "user" as const,
              content: {
                type: "text" as const,
                text: `Here are all action items from the last ${daysBack} days ${filterDesc}. Please organize them by priority and flag any that might be overdue:\n\n${JSON.stringify(groups, null, 2)}`,
              },
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  });
}
