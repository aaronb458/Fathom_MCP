import { randomUUID } from "node:crypto";
import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { FathomClient } from "./api.js";
import { MeetingCache } from "./cache.js";
import { EmbeddingStore } from "./embeddings.js";
import { FathomDB } from "./db.js";
import { registerTools } from "./tools.js";
import { registerPrompts } from "./prompts.js";
import { createWebhookHandler, backfillMeetings } from "./webhook.js";

const app = express();

// Store active transports by session ID
const transports: Record<string, StreamableHTTPServerTransport> = {};

// Shared DB instance (persists across sessions)
const db = new FathomDB();

// Server-level API keys (from env)
const defaultFathomKey = process.env.FATHOM_API_KEY;
const defaultOpenAIKey = process.env.OPENAI_API_KEY; // for embeddings/semantic search
const defaultRouterKey = process.env.OPENROUTER_API_KEY; // for AI extraction

/**
 * Extract the Fathom API key from the request, falling back to env var.
 */
function getApiKey(req: express.Request): string | undefined {
  return (
    (req.headers["x-fathom-api-key"] as string) ||
    (req.query.fathom_api_key as string) ||
    defaultFathomKey ||
    undefined
  );
}

function getOpenAIKey(req: express.Request): string | undefined {
  return (
    (req.headers["x-openai-api-key"] as string) ||
    (req.query.openai_api_key as string) ||
    defaultOpenAIKey ||
    undefined
  );
}

// --- Webhook endpoint (raw body for signature verification) ---
// Must be BEFORE express.json() middleware
if (defaultFathomKey) {
  const client = new FathomClient(defaultFathomKey);
  const webhookHandler = createWebhookHandler(db, client, defaultRouterKey);

  app.post("/webhook", express.raw({ type: "*/*" }), webhookHandler);
}

// JSON parsing for MCP routes
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "fathom-mcp", version: "2.0.0" });
});

// Handle POST /mcp — initialize new sessions and handle tool calls
app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  // Existing session — route to its transport
  if (sessionId && transports[sessionId]) {
    await transports[sessionId].handleRequest(req, res, req.body);
    return;
  }

  // New session — must be an initialize request
  if (!sessionId && isInitializeRequest(req.body)) {
    const apiKey = getApiKey(req);
    if (!apiKey) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message:
            "Missing Fathom API key. Pass it as an x-fathom-api-key header or set FATHOM_API_KEY env var.",
        },
        id: (req.body as { id?: unknown }).id ?? null,
      });
      return;
    }

    const openaiKey = getOpenAIKey(req);

    // Create a per-session transport
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        transports[id] = transport;
      },
      enableJsonResponse: true,
    });

    const server = new Server(
      { name: "fathom-mcp", version: "2.0.0" },
      { capabilities: { tools: {}, prompts: {} } }
    );

    // Per-session: client, cache, embeddings. Shared: db
    const client = new FathomClient(apiKey);
    const cache = new MeetingCache(client);
    const embeddings = new EmbeddingStore(openaiKey);

    registerTools(server, client, cache, embeddings, db);
    registerPrompts(server, cache, embeddings);

    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
      }
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    return;
  }

  res.status(400).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Invalid request. Send an initialize request to start a session.",
    },
    id: null,
  });
});

// Handle GET /mcp — SSE streaming for existing sessions
app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string;
  if (sessionId && transports[sessionId]) {
    await transports[sessionId].handleRequest(req, res);
  } else {
    res.status(400).json({ error: "Invalid or missing session ID" });
  }
});

// Handle DELETE /mcp — session termination
app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string;
  if (sessionId && transports[sessionId]) {
    await transports[sessionId].handleRequest(req, res);
    delete transports[sessionId];
  } else {
    res.status(400).json({ error: "Invalid or missing session ID" });
  }
});

// --- Start server + backfill ---
const port = parseInt(process.env.PORT || "3000", 10);
app.listen(port, "0.0.0.0", async () => {
  console.error(`Fathom MCP remote server listening on port ${port}`);
  console.error(`Webhook endpoint: POST /webhook`);

  if (defaultFathomKey) {
    console.error("Fathom API key: configured");

    // Backfill on first boot
    const client = new FathomClient(defaultFathomKey);
    try {
      await backfillMeetings(db, client, defaultRouterKey);
    } catch (error) {
      console.error("[startup] Backfill failed:", error instanceof Error ? error.message : error);
    }
  } else {
    console.error("Fathom API key: not set (per-request keys required)");
  }

  if (defaultOpenAIKey) {
    console.error("OpenAI key: configured (semantic search enabled)");
  } else {
    console.error("OpenAI key: not set (keyword search only)");
  }

  if (defaultRouterKey) {
    console.error("OpenRouter key: configured (AI extraction enabled)");
  } else {
    console.error("OpenRouter key: not set (no AI action item extraction)");
  }
});
