import { randomUUID } from "node:crypto";
import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { FathomClient } from "./api.js";
import { MeetingCache } from "./cache.js";
import { EmbeddingStore } from "./embeddings.js";
import { registerTools } from "./tools.js";
import { registerPrompts } from "./prompts.js";

const app = express();
app.use(express.json());

// Store active transports by session ID
const transports: Record<string, StreamableHTTPServerTransport> = {};

/**
 * Extract the Fathom API key from the request.
 * Accepts: x-fathom-api-key header OR ?fathom_api_key= query param.
 */
function getApiKey(req: express.Request): string | undefined {
  return (
    (req.headers["x-fathom-api-key"] as string) ||
    (req.query.fathom_api_key as string) ||
    undefined
  );
}

/**
 * Extract optional OpenAI API key for semantic search.
 * Accepts: x-openai-api-key header OR ?openai_api_key= query param.
 */
function getOpenAIKey(req: express.Request): string | undefined {
  return (
    (req.headers["x-openai-api-key"] as string) ||
    (req.query.openai_api_key as string) ||
    undefined
  );
}

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
            "Missing Fathom API key. Pass it as an x-fathom-api-key header or ?fathom_api_key= query parameter.",
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

    // Per-session: client, cache, embeddings
    const client = new FathomClient(apiKey);
    const cache = new MeetingCache(client);
    const embeddings = new EmbeddingStore(openaiKey);

    registerTools(server, client, cache, embeddings);
    registerPrompts(server, cache, embeddings);

    // Clean up session on close
    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
      }
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    return;
  }

  // Invalid request
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

const port = parseInt(process.env.PORT || "3000", 10);
app.listen(port, "0.0.0.0", () => {
  console.error(`Fathom MCP remote server listening on port ${port}`);
  console.error("Pass Fathom API key via x-fathom-api-key header (required)");
  console.error("Pass OpenAI API key via x-openai-api-key header (optional, enables semantic search)");
});
