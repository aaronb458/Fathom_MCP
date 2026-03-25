# Fathom MCP Server

Connect Claude to your [Fathom AI](https://fathom.video) meeting notes. Once set up, you can ask Claude things like "summarize my last meeting" or "show me this week's meetings" and it pulls real data from your Fathom account.

## What Can It Do?

- **List your meetings** — filter by date, team, who recorded, etc.
- **Get meeting summaries** — the AI-generated notes Fathom creates
- **Get full transcripts** — every word, with timestamps and speaker names
- **List teams & team members** — see who's in your Fathom workspace
- **Manage webhooks** — get notified when new meetings are processed

---

## Setup Guide

You need two things already installed on your computer: **Node.js** and **Git**. If you don't have them, start with the prerequisites below. If you already have them, skip to Step 1.

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

---

### Step 1: Get Your Fathom API Key

1. Log into your Fathom account at [fathom.video](https://fathom.video)
2. Click on **Settings** (gear icon)
3. Go to **Integrations**, then **API**
4. Click **Generate API Key**
5. **Copy the key** and save it somewhere (a note, a text file, etc.) — you'll paste it in Step 3

---

### Step 2: Download and Build This Project

Open your terminal and run these four commands **one at a time** (copy a line, paste it, press Enter, wait for it to finish, then do the next one):

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

---

### Step 3: Tell Claude About This Server

Pick the section below that matches how you use Claude:

<details>
<summary><strong>Claude Desktop (the app)</strong></summary>

You need to edit (or create) a settings file. Here's how:

**On Mac:**

1. Open Finder
2. Click **Go** in the menu bar, then **Go to Folder...**
3. Paste this and press Enter: `~/Library/Application Support/Claude/`
4. Look for a file called `claude_desktop_config.json`
   - If it exists, open it with TextEdit (right-click > Open With > TextEdit)
   - If it doesn't exist, open TextEdit, create a new empty file, and save it here with the name `claude_desktop_config.json`

**On Windows:**

1. Press `Windows key + R`, type `%APPDATA%\Claude` and press Enter
2. Look for `claude_desktop_config.json`
   - If it exists, open it with Notepad
   - If it doesn't exist, open Notepad, and save a new file here with that name

**Paste this into the file** (replace the entire contents if the file was empty or didn't exist):

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

**Important — replace two things:**
- Replace `PASTE_YOUR_PATH_HERE` with the path from Step 2 (e.g., `/Users/yourname/Fathom_MCP`)
- Replace `PASTE_YOUR_API_KEY_HERE` with the API key from Step 1

If the file already had other `mcpServers` entries, add the `"fathom": { ... }` block inside the existing `mcpServers` object (don't replace the whole file).

Save the file.

</details>

<details>
<summary><strong>Claude Code (the terminal/CLI tool)</strong></summary>

Open your terminal and run this command to edit the settings file:

**Mac/Linux:**
```bash
open ~/.claude.json
```

**Windows:**
```bash
notepad %USERPROFILE%\.claude.json
```

If the file is empty or doesn't exist, paste this entire block:

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

**Important — replace two things:**
- Replace `PASTE_YOUR_PATH_HERE` with the path from Step 2 (e.g., `/Users/yourname/Fathom_MCP`)
- Replace `PASTE_YOUR_API_KEY_HERE` with the API key from Step 1

Save the file.

</details>

---

### Step 4: Restart Claude

- **Claude Desktop:** Fully quit the app (not just close the window) and reopen it
- **Claude Code:** Close the terminal and open a new one, then start Claude Code again

That's it. You're done.

---

## Try It Out

Start a conversation with Claude and ask something like:

- *"Show me my meetings from this week"*
- *"Get the transcript from my last meeting"*
- *"Summarize yesterday's standup"*
- *"List all my team members"*

---

## Something Not Working?

**Claude says "FATHOM_API_KEY environment variable is required"**
> The API key isn't getting passed to the server. Open your config file from Step 3 and make sure your API key is between the quotes after `FATHOM_API_KEY`.

**Claude says "Fathom API error: 401 Unauthorized"**
> Your API key is wrong or expired. Go back to Fathom (Settings > Integrations > API), generate a new key, paste it into your config file, and restart Claude.

**The Fathom tools don't show up at all**
> Three things to check:
> 1. Did you run `npm run build` in Step 2? (Go back to your terminal, `cd` into the Fathom_MCP folder, and run `npm run build`)
> 2. Is the path in your config file correct? It should end with `/dist/index.js`
> 3. Did you restart Claude after saving the config file?

**"node: command not found" or similar**
> Node.js isn't installed. Go back to the Prerequisites section above.

---

## For Developers

```bash
# Run in dev mode (auto-reloads, no build step)
FATHOM_API_KEY=your-key npm run dev

# Build for production
npm run build

# Run the production build
FATHOM_API_KEY=your-key npm start
```

## License

MIT
