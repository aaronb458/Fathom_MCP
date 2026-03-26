import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { FathomClient } from "./api.js";
import { MeetingCache } from "./cache.js";
import { EmbeddingStore } from "./embeddings.js";
import { FathomDB } from "./db.js";
import { keywordSearch, buildDigest, extractActionItems } from "./search.js";

export function registerTools(
  server: Server,
  client: FathomClient,
  cache: MeetingCache,
  embeddings: EmbeddingStore,
  db?: FathomDB
) {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      // --- Persistent / AI-powered tools ---
      {
        name: "fathom_smart_action_items",
        description:
          "Get AI-extracted action items, decisions, and follow-ups from your meetings. These are generated automatically after each call using AI analysis of the full transcript — more thorough than Fathom's built-in extraction. Use this when users ask about tasks, to-dos, what was decided, or what needs follow-up.",
        inputSchema: {
          type: "object" as const,
          properties: {
            days_back: {
              type: "number",
              description: "How many days back to include (default: 7)",
            },
            assignee: {
              type: "string",
              description: "Filter by assignee name (partial match, case-insensitive)",
            },
            type: {
              type: "string",
              enum: ["action_item", "decision", "follow_up"],
              description: "Filter by item type (default: all types)",
            },
          },
        },
      },
      {
        name: "fathom_weekly_briefing",
        description:
          "Get your Monday morning briefing ��� all meetings from the past week with AI-extracted action items, decisions, and follow-ups organized and ready to review. Use this when users ask 'what do I need to do this week?' or 'catch me up on last week'.",
        inputSchema: {
          type: "object" as const,
          properties: {
            days_back: {
              type: "number",
              description: "How many days to cover (default: 7)",
            },
          },
        },
      },
      // --- Smart search/digest tools ---
      {
        name: "fathom_search_meetings",
        description:
          "Search across your Fathom meetings by topic, keyword, or question. Uses semantic search (if OpenAI key provided) or keyword search on meeting summaries, titles, and action items. Use this when the user asks about a topic, decision, or keyword across meetings. Returns compressed results with relevant excerpts. For a full meeting deep-dive, use fathom_get_meeting_detail with the returned meeting_id.",
        inputSchema: {
          type: "object" as const,
          properties: {
            query: {
              type: "string",
              description: "What to search for (topic, keyword, question, person name, etc.)",
            },
            days_back: {
              type: "number",
              description: "How many days back to search (default: 30)",
            },
            search_transcripts: {
              type: "boolean",
              description:
                "Also search full transcripts, not just summaries. Slower but more thorough. Only set true if summary search finds nothing relevant.",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "fathom_meeting_digest",
        description:
          "Get a compressed overview of meetings in a date range. Returns a token-efficient digest with title, date, duration, attendees, top summary bullets, and action items for each meeting (~200-500 tokens per meeting). Use this for 'what happened this week?' type questions. For deeper detail on a specific meeting, use fathom_get_meeting_detail.",
        inputSchema: {
          type: "object" as const,
          properties: {
            days_back: {
              type: "number",
              description: "How many days back to include (default: 7)",
            },
            team: {
              type: "string",
              description: "Filter by team ID (optional)",
            },
            recorded_by: {
              type: "string",
              description: "Filter by recorder user ID (optional)",
            },
          },
        },
      },
      {
        name: "fathom_get_meeting_detail",
        description:
          "Get full detail for one specific meeting — summary, action items, and optionally the complete transcript. Use this after finding a meeting via search or digest to get the full picture. Only request the transcript when the user needs exact quotes or word-for-word content.",
        inputSchema: {
          type: "object" as const,
          properties: {
            meeting_id: {
              type: "string",
              description: "The meeting ID (from search results, digest, or list_meetings)",
            },
            include_transcript: {
              type: "boolean",
              description:
                "Include the full transcript (default: true). Set to false if you only need the summary.",
            },
          },
          required: ["meeting_id"],
        },
      },
      {
        name: "fathom_action_items",
        description:
          "Extract action items across all meetings in a date range, grouped by meeting. Optionally filter by assignee name. Use this when users ask about to-dos, follow-ups, who owes what, or assigned tasks.",
        inputSchema: {
          type: "object" as const,
          properties: {
            days_back: {
              type: "number",
              description: "How many days back to include (default: 7)",
            },
            assignee: {
              type: "string",
              description: "Filter by assignee name (partial match, case-insensitive)",
            },
          },
        },
      },

      // --- Original tools (kept) ---
      {
        name: "fathom_list_meetings",
        description:
          "Browse meetings by date, team, recorder, or invitee domain. Returns metadata and summaries but NOT transcripts. Use this when the user wants to browse or filter their meeting list. For topic-based search, use fathom_search_meetings instead. For full detail on one meeting, use fathom_get_meeting_detail.",
        inputSchema: {
          type: "object" as const,
          properties: {
            created_after: {
              type: "string",
              description: "ISO 8601 datetime — only return meetings created after this time",
            },
            created_before: {
              type: "string",
              description: "ISO 8601 datetime — only return meetings created before this time",
            },
            recorded_by: {
              type: "array",
              items: { type: "string" },
              description: "Filter by recorder user IDs",
            },
            teams: {
              type: "array",
              items: { type: "string" },
              description: "Filter by team IDs",
            },
            calendar_invitees_domains: {
              type: "array",
              items: { type: "string" },
              description: "Filter by invitee email domains (e.g. 'acme.com')",
            },
            cursor: {
              type: "string",
              description: "Pagination cursor from a previous response",
            },
          },
        },
      },
      {
        name: "fathom_list_teams",
        description: "List all teams in your Fathom workspace.",
        inputSchema: {
          type: "object" as const,
          properties: {
            cursor: {
              type: "string",
              description: "Pagination cursor from a previous response",
            },
          },
        },
      },
      {
        name: "fathom_list_team_members",
        description:
          "List team members in your Fathom workspace. Optionally filter by team ID.",
        inputSchema: {
          type: "object" as const,
          properties: {
            team: {
              type: "string",
              description: "Filter by team ID",
            },
            cursor: {
              type: "string",
              description: "Pagination cursor from a previous response",
            },
          },
        },
      },
      {
        name: "fathom_create_webhook",
        description:
          "Create a webhook that fires when meetings are processed. At least one include_* flag must be true.",
        inputSchema: {
          type: "object" as const,
          properties: {
            destination_url: {
              type: "string",
              description: "URL to receive webhook POST requests",
            },
            triggered_for: {
              type: "array",
              items: { type: "string" },
              description:
                "User IDs whose meetings trigger this webhook. Empty array = all users.",
            },
            include_transcript: {
              type: "boolean",
              description: "Include transcript in webhook payload",
            },
            include_summary: {
              type: "boolean",
              description: "Include summary in webhook payload",
            },
            include_action_items: {
              type: "boolean",
              description: "Include action items in webhook payload",
            },
            include_crm_matches: {
              type: "boolean",
              description: "Include CRM matches in webhook payload",
            },
          },
          required: ["destination_url", "triggered_for"],
        },
      },
      {
        name: "fathom_delete_webhook",
        description: "Delete an existing webhook by its ID.",
        inputSchema: {
          type: "object" as const,
          properties: {
            webhook_id: {
              type: "string",
              description: "The webhook ID to delete",
            },
          },
          required: ["webhook_id"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        // --- Persistent / AI-powered tools ---

        case "fathom_smart_action_items": {
          if (!db) {
            return { content: [{ type: "text", text: "Error: Persistent storage not available. Deploy to Railway or run the remote server for this feature." }], isError: true };
          }
          const daysBack = (args?.days_back as number) || 7;
          const assignee = args?.assignee as string | undefined;
          const itemType = args?.type as string | undefined;

          const groups = db.getExtractedItems({ daysBack, assignee, type: itemType });
          const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0);

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                period: `Last ${daysBack} days`,
                filter: [
                  assignee ? `Assignee: ${assignee}` : null,
                  itemType ? `Type: ${itemType}` : null,
                ].filter(Boolean).join(", ") || "All items",
                total_items: totalItems,
                meetings_count: groups.length,
                groups,
              }, null, 2),
            }],
          };
        }

        case "fathom_weekly_briefing": {
          if (!db) {
            return { content: [{ type: "text", text: "Error: Persistent storage not available. Deploy to Railway or run the remote server for this feature." }], isError: true };
          }
          const daysBack = (args?.days_back as number) || 7;
          const briefing = db.getWeeklyBriefing(daysBack);

          const now = new Date();
          const start = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
          const period = `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                period,
                meetings_count: briefing.meetings.length,
                meetings: briefing.meetings,
                your_action_items: briefing.action_items,
                team_decisions: briefing.decisions,
                follow_ups_needed: briefing.follow_ups,
                totals: {
                  action_items: briefing.action_items.length,
                  decisions: briefing.decisions.length,
                  follow_ups: briefing.follow_ups.length,
                },
              }, null, 2),
            }],
          };
        }

        // --- Smart search/digest tools ---

        case "fathom_search_meetings": {
          const query = args!.query as string;
          const daysBack = (args?.days_back as number) || 30;
          const searchTranscripts = args?.search_transcripts === true;

          const meetings = await cache.getForRange(daysBack);

          // Index meetings for semantic search if available
          if (embeddings.isAvailable()) {
            await embeddings.addMeetings(meetings);

            // If searching transcripts, load them first
            if (searchTranscripts) {
              for (const m of meetings) {
                if (!m.transcript) {
                  await cache.getMeetingDetail(m.recording_id, true);
                }
              }
              const updated = await cache.getForRange(daysBack);
              await embeddings.addMeetings(updated);
            }

            const results = await embeddings.search(query);
            if (results.length > 0) {
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    search_mode: "semantic",
                    query,
                    results_count: results.length,
                    results,
                  }, null, 2),
                }],
              };
            }
          }

          // Fallback to keyword search
          const results = keywordSearch(meetings, query, searchTranscripts);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                search_mode: embeddings.isAvailable() ? "semantic (no results, showing keyword fallback)" : "keyword",
                query,
                results_count: results.length,
                results,
              }, null, 2),
            }],
          };
        }

        case "fathom_meeting_digest": {
          const daysBack = (args?.days_back as number) || 7;
          const meetings = await cache.getForRange(daysBack);

          // TODO: filter by team/recorded_by if provided (requires matching IDs from cached data)
          const digest = buildDigest(meetings);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                period: `Last ${daysBack} days`,
                total_meetings: digest.length,
                meetings: digest,
              }, null, 2),
            }],
          };
        }

        case "fathom_get_meeting_detail": {
          const meetingId = parseInt(args!.meeting_id as string, 10);
          const includeTranscript = args?.include_transcript !== false;

          const meeting = await cache.getMeetingDetail(meetingId, includeTranscript);
          if (!meeting) {
            return {
              content: [{ type: "text", text: `Meeting not found: ${meetingId}` }],
              isError: true,
            };
          }

          // Index for future semantic search
          if (embeddings.isAvailable()) {
            await embeddings.addMeeting(meeting);
          }

          return {
            content: [{ type: "text", text: JSON.stringify(meeting, null, 2) }],
          };
        }

        case "fathom_action_items": {
          const daysBack = (args?.days_back as number) || 7;
          const assignee = args?.assignee as string | undefined;

          const meetings = await cache.getForRange(daysBack);
          const groups = extractActionItems(meetings, assignee);

          const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                period: `Last ${daysBack} days`,
                filter: assignee ? `Assignee: ${assignee}` : "All assignees",
                total_action_items: totalItems,
                meetings_with_items: groups.length,
                groups,
              }, null, 2),
            }],
          };
        }

        // --- Original tools ---

        case "fathom_list_meetings": {
          const params: Record<string, string | string[] | boolean | undefined> = {};
          if (args?.created_after) params.created_after = args.created_after as string;
          if (args?.created_before) params.created_before = args.created_before as string;
          if (args?.recorded_by) params["recorded_by[]"] = args.recorded_by as string[];
          if (args?.teams) params["teams[]"] = args.teams as string[];
          if (args?.calendar_invitees_domains)
            params["calendar_invitees_domains[]"] = args.calendar_invitees_domains as string[];
          if (args?.cursor) params.cursor = args.cursor as string;
          // Always include summaries and action items, never bulk transcripts
          params.include_summary = true;
          params.include_action_items = true;

          const result = await client.listMeetings(params);
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        case "fathom_list_teams": {
          const result = await client.listTeams({
            cursor: args?.cursor as string | undefined,
          });
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        case "fathom_list_team_members": {
          const result = await client.listTeamMembers({
            team: args?.team as string | undefined,
            cursor: args?.cursor as string | undefined,
          });
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        case "fathom_create_webhook": {
          const includeTranscript = args?.include_transcript === true;
          const includeSummary = args?.include_summary === true;
          const includeActionItems = args?.include_action_items === true;
          const includeCrmMatches = args?.include_crm_matches === true;

          if (!includeTranscript && !includeSummary && !includeActionItems && !includeCrmMatches) {
            return {
              content: [{
                type: "text",
                text: "Error: At least one include_* flag must be true (include_transcript, include_summary, include_action_items, or include_crm_matches).",
              }],
              isError: true,
            };
          }

          const result = await client.createWebhook({
            destination_url: args!.destination_url as string,
            triggered_for: args!.triggered_for as string[],
            include_transcript: includeTranscript,
            include_summary: includeSummary,
            include_action_items: includeActionItems,
            include_crm_matches: includeCrmMatches,
          });
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        case "fathom_delete_webhook": {
          await client.deleteWebhook(args!.webhook_id as string);
          return { content: [{ type: "text", text: "Webhook deleted successfully." }] };
        }

        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? (error as { message: string }).message
            : String(error);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    }
  });
}
