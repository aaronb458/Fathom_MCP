import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { FathomClient } from "./api.js";

export function registerTools(server: Server, client: FathomClient) {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "fathom_list_meetings",
        description:
          "List meetings from Fathom AI. Supports filtering by date range, recorder, team, and invitee domains. Can optionally include transcript, summary, action items, and CRM matches inline.",
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
            include_transcript: {
              type: "boolean",
              description: "Include full transcript in each meeting",
            },
            include_summary: {
              type: "boolean",
              description: "Include summary in each meeting",
            },
            include_action_items: {
              type: "boolean",
              description: "Include action items in each meeting",
            },
            include_crm_matches: {
              type: "boolean",
              description: "Include CRM matches in each meeting",
            },
          },
        },
      },
      {
        name: "fathom_get_summary",
        description:
          "Get the AI-generated summary for a specific Fathom recording. Returns structured sections with bullet points.",
        inputSchema: {
          type: "object" as const,
          properties: {
            recording_id: {
              type: "string",
              description: "The recording/meeting ID",
            },
          },
          required: ["recording_id"],
        },
      },
      {
        name: "fathom_get_transcript",
        description:
          "Get the full transcript for a specific Fathom recording. Returns timestamped speaker turns.",
        inputSchema: {
          type: "object" as const,
          properties: {
            recording_id: {
              type: "string",
              description: "The recording/meeting ID",
            },
          },
          required: ["recording_id"],
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
        case "fathom_list_meetings": {
          const params: Record<string, string | string[] | boolean | undefined> = {};
          if (args?.created_after) params.created_after = args.created_after as string;
          if (args?.created_before) params.created_before = args.created_before as string;
          if (args?.recorded_by) params["recorded_by[]"] = args.recorded_by as string[];
          if (args?.teams) params["teams[]"] = args.teams as string[];
          if (args?.calendar_invitees_domains)
            params["calendar_invitees_domains[]"] = args.calendar_invitees_domains as string[];
          if (args?.cursor) params.cursor = args.cursor as string;
          if (args?.include_transcript) params.include_transcript = true;
          if (args?.include_summary) params.include_summary = true;
          if (args?.include_action_items) params.include_action_items = true;
          if (args?.include_crm_matches) params.include_crm_matches = true;

          const result = await client.listMeetings(params);
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        case "fathom_get_summary": {
          const result = await client.getSummary(args!.recording_id as string);
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        case "fathom_get_transcript": {
          const result = await client.getTranscript(args!.recording_id as string);
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        case "fathom_list_team_members": {
          const result = await client.listTeamMembers({
            team: args?.team as string | undefined,
            cursor: args?.cursor as string | undefined,
          });
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        case "fathom_list_teams": {
          const result = await client.listTeams({
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
              content: [
                {
                  type: "text",
                  text: "Error: At least one include_* flag must be true (include_transcript, include_summary, include_action_items, or include_crm_matches).",
                },
              ],
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
