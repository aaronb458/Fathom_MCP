# Fathom MCP Server

Connect Claude to your [Fathom AI](https://fathom.video) meeting notes. Once set up, you can ask Claude things like "summarize my last meeting" or "show me this week's meetings" and it pulls real data from your Fathom account.

## What Can It Do?

- **List your meetings** — filter by date, team, who recorded, etc.
- **Get meeting summaries** — the AI-generated notes Fathom creates
- **Get full transcripts** — every word, with timestamps and speaker names
- **List teams & team members** — see who's in your Fathom workspace
- **Manage webhooks** — get notified when new meetings are processed

---

## Choose Your Setup

There are **two ways** to use this server. Pick whichever sounds easier to you:

| Option | Best For | What You Need |
|--------|----------|---------------|
| **A. Use a Hosted Server** | Non-technical users, quick start | Just your Fathom API key |
| **B. Run It Locally** | Developers, full control | Node.js + Git installed |

---

## Option A: Use a Hosted Server (Easiest)

If someone has shared a hosted URL with you (like `https://fathom-mcp.up.railway.app/mcp`), you don't need to install anything on your computer. All you need is your Fathom API key.

### Step 1: Get Your Fathom API Key

1. Log into your Fathom account at [fathom.video](https://fathom.video)
2. Click on **Settings** (gear icon)
3. Go to **Integrations**, then **API**
4. Click **Generate API Key**
5. **Copy the key** and save it somewhere safe

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
        "x-fathom-api-key": "PASTE_YOUR_API_KEY_HERE"
      }
    }
  }
}
```

Replace:
- `PASTE_SERVER_URL_HERE` with the hosted server URL you were given (e.g., `https://fathom-mcp.up.railway.app`)
- `PASTE_YOUR_API_KEY_HERE` with your Fathom API key from Step 1

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
        "x-fathom-api-key": "PASTE_YOUR_API_KEY_HERE"
      }
    }
  }
}
```

Replace:
- `PASTE_SERVER_URL_HERE` with the hosted server URL you were given
- `PASTE_YOUR_API_KEY_HERE` with your Fathom API key from Step 1

Save the file.

</details>

### Step 3: Restart Claude

- **Claude Desktop:** Fully quit the app (not just close the window) and reopen it
- **Claude Code:** Close the terminal, open a new one, and start Claude Code again

That's it. You're done.

---

## Option B: Run It Locally

This installs the server on your own computer. Claude launches it automatically when needed.

### Prerequisites (skip if you already have Node.js and Git)

<details>
<summary><strong>How to check if you already have them</strong></summary>

Open your terminal:
- **Mac:** Open the **Terminal** app (search "Terminal" in Spotlight, or find it in Applications > Utilities)
- **Windows:** Open **Command Prompt** (search "cmd" in the Start menu)

Type each of these and press Enter:

```
node --version
git --version
```

If both show a version number (like `v20.11.0`), you're good — skip to Step 1.

If either says "command not found" or gives an error, install the missing one below.

</details>

<details>
<summary><strong>Install Node.js</strong></summary>

1. Go to [https://nodejs.org](https://nodejs.org)
2. Click the big green **LTS** download button
3. Open the downloaded file and follow the installer prompts (just keep clicking Next/Continue)
4. When it's done, close and reopen your terminal, then type `node --version` to confirm it worked

</details>

<details>
<summary><strong>Install Git</strong></summary>

- **Mac:** Open Terminal and type `git --version`. If Git isn't installed, your Mac will prompt you to install it — click **Install** and follow the prompts.
- **Windows:** Go to [https://git-scm.com](https://git-scm.com), download the installer, and run it. Use all the default options.

</details>

### Step 1: Get Your Fathom API Key

1. Log into your Fathom account at [fathom.video](https://fathom.video)
2. Click on **Settings** (gear icon)
3. Go to **Integrations**, then **API**
4. Click **Generate API Key**
5. **Copy the key** and save it somewhere (a note, a text file, etc.) — you'll paste it in Step 3

### Step 2: Download and Build This Project

Open your terminal and run these commands **one at a time** (copy a line, paste it, press Enter, wait for it to finish, then do the next one):

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

After the last command finishes, you need to know the **full path** to this folder. Run this command and **copy the result**:

- **Mac/Linux:**
  ```bash
  pwd
  ```
- **Windows:**
  ```bash
  cd
  ```

It will print something like `/Users/yourname/Fathom_MCP` — save that, you'll need it in the next step.

### Step 3: Tell Claude About This Server

<details>
<summary><strong>Claude Desktop (the app)</strong></summary>

Open your Claude Desktop config file (see Option A, Step 2 above for how to find it).

**Paste this into the file:**

```json
{
  "mcpServers": {
    "fathom": {
      "command": "node",
      "args": ["PASTE_YOUR_PATH_HERE/dist/index.js"],
      "env": {
        "FATHOM_API_KEY": "PASTE_YOUR_API_KEY_HERE"
      }
    }
  }
}
```

Replace:
- `PASTE_YOUR_PATH_HERE` with the path from Step 2 (e.g., `/Users/yourname/Fathom_MCP`)
- `PASTE_YOUR_API_KEY_HERE` with your Fathom API key from Step 1

If the file already had other `mcpServers` entries, add the `"fathom": { ... }` block inside the existing `mcpServers` object (don't replace the whole file).

Save the file.

</details>

<details>
<summary><strong>Claude Code (the terminal/CLI tool)</strong></summary>

Open `~/.claude.json` in any text editor and add:

```json
{
  "mcpServers": {
    "fathom": {
      "command": "node",
      "args": ["PASTE_YOUR_PATH_HERE/dist/index.js"],
      "env": {
        "FATHOM_API_KEY": "PASTE_YOUR_API_KEY_HERE"
      }
    }
  }
}
```

Replace:
- `PASTE_YOUR_PATH_HERE` with the path from Step 2 (e.g., `/Users/yourname/Fathom_MCP`)
- `PASTE_YOUR_API_KEY_HERE` with your Fathom API key from Step 1

Save the file.

</details>

### Step 4: Restart Claude

- **Claude Desktop:** Fully quit the app (not just close the window) and reopen it
- **Claude Code:** Close the terminal, open a new one, and start Claude Code again

That's it. You're done.

---

## Try It Out

Start a conversation with Claude and ask something like:

- *"Show me my meetings from this week"*
- *"Get the transcript from my last meeting"*
- *"Summarize yesterday's standup"*
- *"List all my team members"*
- *"Set up a webhook to notify me when meetings are processed"*

---

## Hosting Your Own Server (for sharing with others)

If you want to host this so friends or teammates can use it without installing anything, you can deploy the remote server to Railway, Render, Fly.io, or any platform that runs Docker.

### Deploy to Railway

1. Fork this repo on GitHub
2. Go to [railway.app](https://railway.app) and create a new project
3. Choose **Deploy from GitHub repo** and select your fork
4. Railway will auto-detect the Dockerfile and deploy

That's it. Railway gives you a public URL like `https://fathom-mcp-production-xxxx.up.railway.app`. Share that URL with your friends — they follow **Option A** above using that URL.

Each person brings their own Fathom API key. The server never stores keys — it only uses them for the duration of each session.

### Deploy Anywhere with Docker

```bash
# Build
npm run build
docker build -t fathom-mcp .

# Run
docker run -p 3000:3000 fathom-mcp
```

The server listens on port 3000 (configurable via `PORT` environment variable). No server-side API key needed — each user passes their own key via the `x-fathom-api-key` header.

---

## Something Not Working?

**Claude says "FATHOM_API_KEY environment variable is required"**
> The API key isn't getting passed to the server. Open your config file and make sure your API key is between the quotes after `FATHOM_API_KEY`.

**Claude says "Fathom API error: 401 Unauthorized"**
> Your API key is wrong or expired. Go back to Fathom (Settings > Integrations > API), generate a new key, paste it into your config file, and restart Claude.

**Claude says "Missing Fathom API key"** (remote/hosted mode)
> Your config is missing the `x-fathom-api-key` header. Make sure your config includes the `headers` block with your API key.

**The Fathom tools don't show up at all**
> Three things to check:
> 1. **Local mode:** Did you run `npm run build`? Is the path correct and ending with `/dist/index.js`?
> 2. **Remote mode:** Is the URL correct and ending with `/mcp`?
> 3. Did you restart Claude after saving the config file?

**"node: command not found" or similar**
> Node.js isn't installed. Go back to the Prerequisites section in Option B.

---

## For Developers

```bash
# Local stdio mode (for Claude Desktop / Claude Code)
FATHOM_API_KEY=your-key npm run dev

# Remote HTTP mode (for hosting)
npm run dev:remote

# Build for production
npm run build

# Run local production build
FATHOM_API_KEY=your-key npm start

# Run remote production build
npm run start:remote
```

## License

MIT
