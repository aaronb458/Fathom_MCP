# Fathom MCP Server

An MCP (Model Context Protocol) server that connects AI assistants like Claude to your [Fathom AI](https://fathom.video) meeting data. List meetings, pull transcripts, get summaries, manage webhooks — all through natural conversation.

## What You Get

| Tool | What It Does |
|------|-------------|
| `fathom_list_meetings` | List and filter meetings by date, recorder, team, or invitee domain |
| `fathom_get_summary` | Get the AI-generated summary for a specific recording |
| `fathom_get_transcript` | Get the full timestamped transcript for a recording |
| `fathom_list_teams` | List all teams in your Fathom workspace |
| `fathom_list_team_members` | List team members, optionally filtered by team |
| `fathom_create_webhook` | Create a webhook for meeting events |
| `fathom_delete_webhook` | Delete a webhook |

## Setup (5 minutes)

### 1. Get Your Fathom API Key

1. Log into [Fathom](https://fathom.video)
2. Go to **Settings > Integrations > API**
3. Click **Generate API Key**
4. Copy the key — you'll need it in step 3

### 2. Install & Build

```bash
git clone https://github.com/aaronb458/Fathom_MCP.git
cd Fathom_MCP
npm install
npm run build
```

### 3. Add to Claude Desktop

Open your Claude Desktop config file:

- **Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Add this to the `mcpServers` section (create the file if it doesn't exist):

```json
{
  "mcpServers": {
    "fathom": {
      "command": "node",
      "args": ["/FULL/PATH/TO/Fathom_MCP/dist/index.js"],
      "env": {
        "FATHOM_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Replace `/FULL/PATH/TO/Fathom_MCP` with the actual path where you cloned the repo (e.g., `/Users/yourname/Fathom_MCP`).

### 4. Add to Claude Code (CLI)

If you use Claude Code instead of (or in addition to) Claude Desktop, add this to your Claude Code settings (`~/.claude.json`):

```json
{
  "mcpServers": {
    "fathom": {
      "command": "node",
      "args": ["/FULL/PATH/TO/Fathom_MCP/dist/index.js"],
      "env": {
        "FATHOM_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### 5. Restart Claude

Restart Claude Desktop or Claude Code. You should see the Fathom tools available.

## Try It

Once set up, just ask Claude things like:

- *"Show me my meetings from this week"*
- *"Get the transcript from my last meeting"*
- *"Summarize yesterday's standup"*
- *"List all my team members"*
- *"Set up a webhook to notify me at https://example.com/hook when meetings are processed"*

## Troubleshooting

**"FATHOM_API_KEY environment variable is required"**
Your API key isn't being passed. Double-check your config file — make sure the key is in the `env` block and the path to `dist/index.js` is correct.

**"Fathom API error: 401 Unauthorized"**
Your API key is invalid or expired. Generate a new one from Fathom Settings > Integrations > API.

**Tools not showing up in Claude**
Make sure you ran `npm run build` and restarted Claude after editing the config file. Check that the path in `args` points to the built `dist/index.js` file, not the `src/` directory.

## Development

```bash
# Run in dev mode (no build step needed)
FATHOM_API_KEY=your-key npm run dev

# Build for production
npm run build

# Run production build
FATHOM_API_KEY=your-key npm start
```

## License

MIT
