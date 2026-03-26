import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FathomClient } from "./api.js";
import { MeetingCache } from "./cache.js";
import { EmbeddingStore } from "./embeddings.js";
import { FathomDB } from "./db.js";
import { registerTools } from "./tools.js";
import { registerPrompts } from "./prompts.js";

const apiKey = process.env.FATHOM_API_KEY;
if (!apiKey) {
  console.error("FATHOM_API_KEY environment variable is required");
  process.exit(1);
}

const openaiKey = process.env.OPENAI_API_KEY;

const server = new Server(
  { name: "fathom-mcp", version: "2.0.0" },
  { capabilities: { tools: {}, prompts: {} } }
);

const client = new FathomClient(apiKey);
const cache = new MeetingCache(client);
const embeddings = new EmbeddingStore(openaiKey);
const db = new FathomDB();

registerTools(server, client, cache, embeddings, db);
registerPrompts(server, cache, embeddings);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Fathom MCP server running on stdio");
  if (openaiKey) {
    console.error("Semantic search + AI extraction enabled");
  } else {
    console.error("Keyword search only (set OPENAI_API_KEY for semantic search + AI extraction)");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
