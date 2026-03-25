import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FathomClient } from "./api.js";
import { registerTools } from "./tools.js";

const apiKey = process.env.FATHOM_API_KEY;
if (!apiKey) {
  console.error("FATHOM_API_KEY environment variable is required");
  process.exit(1);
}

const server = new Server(
  { name: "fathom-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

const client = new FathomClient(apiKey);
registerTools(server, client);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Fathom MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
