# Fathom MCP Server

Connect Claude to your [Fathom AI](https://fathom.video) meeting notes. Ask Claude things like "what did we decide about pricing last week?" or "show me all my action items" and it searches your real Fathom data — with optional AI-powered semantic search.

## What Can It Do?

- **Search meetings by topic** — "what did we discuss about the Q4 budget?" finds relevant meetings even if those exact words weren't used (with semantic search)
- **Weekly digests** — compressed overviews of all your meetings, not raw data dumps
- **Action item extraction** — pull all to-dos across meetings, filter by who they're assigned to
- **Deep dive into any meeting** — full summary, action items, and transcript on demand
- **Browse & filter** — by date, team, recorder, or invitee domain
- **Teams & members** — see who's in your Fathom workspace
- **Webhooks** — get notified when new meetings are processed

### Two Search Modes

| Mode | Requires | How It Works |
|------|----------|-------------|
| **Keyword search** | Just your Fathom API key | Searches meeting titles, summaries, and action items for exact keyword matches |
| **Semantic search** | Fathom + OpenAI API key | Uses AI embeddings to find conceptually related content — "budget concerns" finds meetings about "cost structure" or "rate card" |

Semantic search is optional. Everything works without it — it just makes search smarter.

---

## Choose Your Setup

| Option | Best For | What You Need |
|--------|----------|---------------|
| **A. Use a Hosted Server** | Non-technical users, quick start | Just your API key(s) |
| **B. Run It Locally** | Developers, full control | Node.js + Git installed |

---

## Option A: Use a Hosted Server (Easiest)

If someone has shared a hosted URL with you (like `https://fathom-mcp.up.railway.app/mcp`), you don't need to install anything. All you need is your Fathom API key.

### Step 1: Get Your API Keys

1. **Fathom API Key (required):**
   - Log into [fathom.video](https://fathom.video)
   - Go to **Settings** > **Integrations** > **API**
   - Click **Generate API Key** and copy it

2. **OpenAI API Key (optional — enables semantic search):**
   - Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
   - Create a new key and copy it
   - Cost: practically free (~$0.0002 per meeting searched)

### Step 2: Add to Claude

<details>
<summary><strong>Claude Desktop (the app)</strong></summary>

Open your Claude Desktop config file:

**On Mac:**
1. Open Finder
2. Click **Go** in the menu bar, then **Go to Folder...**
3. Paste this and press Enter: `~/Library/Application Support/Claude/`
4. Look for `claude_desktop_config.json` — open it with TextEdit, or create a new file with that name

**On Windows:**
1. Press `Windows key + R`, type `%APPDATA%\Claude` and press Enter
2. Look for `claude_desktop_config.json` — open it with Notepad, or create a new file with that name

**Paste this into the file:**

```json
{
  "mcpServers": {
    "fathom": {
      "type": "streamable-http",
      "url": "PASTE_SERVER_URL_HERE/mcp",
      "headers": {
        "x-fathom-api-key": "PASTE_YOUR_FATHOM_KEY_HERE",
        "x-openai-api-key": "PASTE_YOUR_OPENAI_KEY_HERE"
      }
    }
  }
}
```

Replace the three `PASTE_...` values with your actual keys and the server URL. If you don't have an OpenAI key, just remove that line entirely — everything still works.

Save the file.

</details>

<details>
<summary><strong>Claude Code (the terminal/CLI tool)</strong></summary>

Open `~/.claude.json` in any text editor and add:

```json
{
  "mcpServers": {
    "fathom": {
      "type": "streamable-http",
      "url": "PASTE_SERVER_URL_HERE/mcp",
      "headers": {
        "x-fathom-api-key": "PASTE_YOUR_FATHOM_KEY_HERE",
        "x-openai-api-key": "PASTE_YOUR_OPENAI_KEY_HERE"
      }
    }
  }
}
```

Remove the `x-openai-api-key` line if you don't have one. Save the file.

</details>

### Step 3: Restart Claude

- **Claude Desktop:** Fully quit the app (not just close the window) and reopen it
- **Claude Code:** Close the terminal, open a new one, start Claude Code again

That's it. You're done.

---

## Option B: Run It Locally

This installs the server on your own computer. Claude launches it automatically when needed.

### Prerequisites (skip if you already have Node.js and Git)

<details>
<summary><strong>How to check if you already have them</strong></summary>

Open your terminal:
- **Mac:** Open the **Terminal** app (search "Terminal" in Spotlight)
- **Windows:** Open **Command Prompt** (search "cmd" in the Start menu)

Type each of these and press Enter:

```
node --version
git --version
```

If both show a version number (like `v20.11.0`), skip to Step 1.

</details>

<details>
<summary><strong>Install Node.js</strong></summary>

1. Go to [https://nodejs.org](https://nodejs.org)
2. Click the big green **LTS** download button
3. Open the downloaded file and follow the installer
4. Close and reopen your terminal, then type `node --version` to confirm

</details>

<details>
<summary><strong>Install Git</strong></summary>

- **Mac:** Type `git --version` in Terminal. If not installed, your Mac will prompt you — click **Install**.
- **Windows:** Go to [https://git-scm.com](https://git-scm.com), download, and install with defaults.

</details>

### Step 1: Get Your API Keys

Same as Option A, Step 1 above — get your Fathom key (required) and optionally an OpenAI key.

### Step 2: Download and Build

Run these **one at a time** in your terminal:

```bash
git clone https://github.com/aaronb458/Fathom_MCP.git
```

```bash
cd Fathom_MCP
```

```bash
npm install
```

```bash
npm run build
```

Then get the full path to this folder:

- **Mac/Linux:** `pwd`
- **Windows:** `cd`

Copy the result (e.g., `/Users/yourname/Fathom_MCP`).

### Step 3: Tell Claude About This Server

<details>
<summary><strong>Claude Desktop (the app)</strong></summary>

Open your config file (see Option A, Step 2 for how to find it) and paste:

```json
{
  "mcpServers": {
    "fathom": {
      "command": "node",
      "args": ["PASTE_YOUR_PATH_HERE/dist/index.js"],
      "env": {
        "FATHOM_API_KEY": "PASTE_YOUR_FATHOM_KEY_HERE",
        "OPENAI_API_KEY": "PASTE_YOUR_OPENAI_KEY_HERE"
      }
    }
  }
}
```

Replace the `PASTE_...` values. Remove the `OPENAI_API_KEY` line if you don't have one. Save.

</details>

<details>
<summary><strong>Claude Code (the terminal/CLI tool)</strong></summary>

Open `~/.claude.json` and add:

```json
{
  "mcpServers": {
    "fathom": {
      "command": "node",
      "args": ["PASTE_YOUR_PATH_HERE/dist/index.js"],
      "env": {
        "FATHOM_API_KEY": "PASTE_YOUR_FATHOM_KEY_HERE",
        "OPENAI_API_KEY": "PASTE_YOUR_OPENAI_KEY_HERE"
      }
    }
  }
}
```

Remove the `OPENAI_API_KEY` line if you don't have one. Save.

</details>

### Step 4: Restart Claude

- **Claude Desktop:** Fully quit and reopen
- **Claude Code:** Close terminal, open new one, start Claude Code

Done.

---

## Try It Out

Once set up, just talk to Claude naturally:

- *"What happened in my meetings this week?"*
- *"What did we decide about pricing in last week's meetings?"*
- *"Show me all my action items from the past 7 days"*
- *"Get the full transcript from my last client call"*
- *"What action items are assigned to Sarah?"*
- *"Summarize yesterday's standup"*

---

## Tools Reference

| Tool | What It Does |
|------|-------------|
| `fathom_search_meetings` | Search by topic/keyword across summaries (semantic or keyword) |
| `fathom_meeting_digest` | Compressed overview of meetings in a date range |
| `fathom_get_meeting_detail` | Full summary + transcript for one specific meeting |
| `fathom_action_items` | Action items across meetings, optionally by assignee |
| `fathom_list_meetings` | Browse/filter meetings by date, team, recorder |
| `fathom_list_teams` | List workspace teams |
| `fathom_list_team_members` | List team members |
| `fathom_create_webhook` | Create a meeting event webhook |
| `fathom_delete_webhook` | Delete a webhook |

---

## Hosting Your Own Server

Deploy this so friends/teammates can use it without installing anything.

### Railway (Recommended)

1. Fork this repo on GitHub
2. Go to [railway.app](https://railway.app), create a new project
3. Choose **Deploy from GitHub repo** and select your fork
4. Railway auto-detects the Dockerfile and deploys

Share the URL with friends — they follow **Option A** using that URL. Each person brings their own API keys. The server never stores keys.

### Docker

```bash
npm run build
docker build -t fathom-mcp .
docker run -p 3000:3000 fathom-mcp
```

---

## Something Not Working?

**"FATHOM_API_KEY environment variable is required"**
> Open your config file and check the API key is in the right spot.

**"Fathom API error: 401 Unauthorized"**
> API key is wrong or expired. Generate a new one in Fathom Settings.

**"Missing Fathom API key"** (remote mode)
> Your config needs the `x-fathom-api-key` header.

**Tools don't show up**
> 1. Local: did you run `npm run build`? Is the path ending with `/dist/index.js`?
> 2. Remote: is the URL ending with `/mcp`?
> 3. Did you restart Claude?

**Search results aren't great**
> Add an OpenAI API key for semantic search. Without it, only exact keyword matches work.

---

## For Developers

```bash
# Local stdio mode
FATHOM_API_KEY=your-key npm run dev

# Local with semantic search
FATHOM_API_KEY=your-key OPENAI_API_KEY=your-key npm run dev

# Remote HTTP mode
npm run dev:remote

# Build for production
npm run build
```

## License

MIT
