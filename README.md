# iTerm2 MCP Server

An MCP (Model Context Protocol) server that lets Claude interact with your iTerm2 terminal sessions with an approval workflow. You see proposed commands before they execute!

## Features

- 🔍 **List all iTerm2 sessions** - See all your terminal windows, tabs, and sessions
- 📝 **Propose commands** - Claude types commands but waits for your approval
- ✅ **Execute on approval** - You explicitly approve each command before it runs
- 👀 **Read output** - Claude can see command results to help debug or continue
- ⚡ **Run and wait** - Executing returns just the new output once the command finishes (no polling)
- 🪶 **Token-lean** - Reads return only output Claude hasn't seen yet, capped, optionally grep-filtered
- 🎯 **Targets sessions by ID** - Work in any pane; refuses the pane Claude itself runs in
- 🆕 **Create new tabs** - Spin up fresh terminal sessions as needed
- 🌐 **Works with SSH** - Control remote sessions just like local ones

## How It Works

1. **You chat with Claude** in Claude Code or the Claude desktop app
2. **Claude proposes a command** - It gets typed in your terminal but doesn't execute
3. **You review it** - See the actual command in your terminal window
4. **You approve or reject** - Tell Claude to proceed or cancel
5. **Claude executes** - Only then does it press Enter

## Installation

### Prerequisites

- **macOS** (tested on macOS 10.15+)
- **iTerm2** installed
- **Node.js 18+** (required for MCP SDK)
- **Claude Code** and/or **Claude Desktop**

### Quick Install

```bash
cd iterm2-mcp-server
./install.sh
```

The installer will:
- Detect your Node.js installation (handles nvm automatically)
- Install npm dependencies
- Show you the exact config to add
- Guide you through iTerm2 automation setup

### Manual Setup

If you prefer to set up manually:

#### 1. Install Dependencies

```bash
npm install
chmod +x index.js
```

#### 2. Find Your Node.js Path

**CRITICAL:** You must use the **full path** to Node.js, not just `"node"`.

```bash
# If using nvm (most common issue)
which node
# Example output: /Users/yourname/.nvm/versions/node/v20.20.0/bin/node

# If using Homebrew
which node
# Example output: /opt/homebrew/bin/node
```

**Why?** Claude Desktop doesn't inherit your shell's nvm setup, so it defaults to an old Node version if you just use `"node"`. Using the full path ensures it always uses the right version.

#### 3. Configure Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "iterm2": {
      "command": "/Users/yourname/.nvm/versions/node/v20.20.0/bin/node",
      "args": ["/absolute/path/to/iterm2-mcp-server/index.js"]
    }
  }
}
```

**Replace:**
- The node path with YOUR actual path from step 2
- The index.js path with the absolute path to where you installed this

#### 3b. Or add to Claude Code

```bash
claude mcp add --scope user iterm2 -- "$(which node)" /absolute/path/to/iterm2-mcp-server/index.js
```

#### 4. Set Up iTerm2 Automation (One-Time)

**IMPORTANT:** To grant initial permissions, you need to temporarily allow automation:

1. Open **iTerm2 Preferences** (⌘,)
2. Go to **General → Magic**
3. Change **"Require 'Automation' permission"** to: **"Allow all apps to connect"**
4. Restart iTerm2
5. **Restart Claude Desktop** (⌘Q then reopen)
6. Use Claude to interact with iTerm2 once (e.g., "list my sessions")
7. **Change back** to **"Require 'Automation' permission"** for security

**Why?** macOS needs to see an actual automation attempt before it registers Claude's access. This one-time setup makes it work.

#### 5. Restart Claude Desktop

Quit completely (⌘Q) and reopen.

## Usage

### Basic Workflow

1. Open Claude Desktop and start a conversation
2. Make sure iTerm2 is running
3. Ask Claude to help with terminal tasks

### Example Conversations

**List Sessions:**
```
You: "List my iTerm sessions"
Claude: [shows your sessions]
```

**Run Commands:**
```
You: "Check disk space on my system"
Claude: "I've typed 'df -h' in your terminal. Should I execute it?"
You: "Yes"
Claude: [executes and shows results]
```

**SSH Sessions:**
```
You: "SSH to my server and check if nginx is running"
Claude: [proposes: ssh user@server]
You: "Go ahead"
Claude: [connects, then proposes: systemctl status nginx]
```

## Tools

| Tool | What it does |
|---|---|
| `list_iterm_sessions` | One line per session: `id \| tty \| window/tab \| name`. Marks Claude's own terminal and any staged command. |
| `propose_command` | Types a single-line command into a session **without** pressing Enter. Refuses if a command is already staged there (unless `replace: true`), refuses multi-line commands (each newline would press Enter), and refuses Claude's own terminal. |
| `execute_command` | Presses Enter on the staged command, then (by default) waits until a prompt returns or output settles and returns only the new output: `Ran (prompt, 1.2s): …`. Options: `wait`, `timeout_s`, `settle_ms`, `prompt_regex`, `grep`, `max_chars`. |
| `read_session_output` | `mode: "new"` (default) returns only lines not yet returned for that session; `mode: "tail"` returns the last `lines`. Supports `grep` and `max_chars` (default 6000, newest kept). |
| `clear_proposed_command` | Clears the staged line (Ctrl-U). |
| `create_new_tab` | Opens a tab and returns its session ID. |

`session_id` is optional after the first call; it defaults to the last session used.

## Limitations

- **Multi-line commands** are refused by design. Join with `;`/`&&`, or write a script file and run that.
- **Prompt detection** is heuristic (ends in `$ # % > ❯ -->`, `--More--`, `Password:`, `?`; right-aligned prompt segments are ignored). If it doesn't match your prompt, output is returned once it stops changing (`settle_ms`), or pass `prompt_regex`.
- **Staged-command tracking** lives in the server process; if you run or clear a staged command by hand, the next propose notices the line changed and carries on.

## Security

### What's Protected

✅ **Explicit approval required** - Commands are typed but not run automatically  
✅ **Visible actions** - Every command appears in your terminal  
✅ **Local only** - No network communication, MCP over stdio  
✅ **No credentials stored** - Uses your existing SSH sessions  
✅ **SSH safe** - Works with remote sessions without installing anything remotely

### Best Practices

- Review every command before approving
- Use iTerm2's "Require 'Automation' permission" setting after initial setup
- Don't approve commands you don't understand
- Claude can see terminal output after commands run

## Troubleshooting

### "Node.js version too old" or MCP server crashes

**Problem:** You're using Node.js < 18  
**Solution:** The installer handles this automatically, or manually:

```bash
# Check version
node --version

# If using nvm
nvm use 20  # or higher

# Update your config with the new path
which node  # Use this full path in claude_desktop_config.json
```

### "Can't get session" or AppleScript errors

**Problem:** iTerm2 automation not set up  
**Solution:**

1. Temporarily set iTerm2 to "Allow all apps to connect"
2. Restart iTerm2 and Claude Desktop
3. Use Claude once ("list my sessions")
4. Lock down automation again

### Commands don't appear in terminal

**Problem:** Wrong session ID or permissions  
**Solution:**

- Ask Claude to run `list_iterm_sessions` again (IDs change when panes are closed/reopened)
- "Session not found" means the ID is stale; "Not permitted" means Automation permission

### "Server disconnected" in logs

**Problem:** Usually Node version mismatch  
**Solution:**

- Check `~/Library/Logs/Claude/mcp-server-iterm2.log`
- Verify you're using the full path to Node 18+
- Run `./install.sh` again to get the right path

### Permission dialog never appears

**Problem:** macOS doesn't show the automation dialog  
**Solution:**

- Use the temporary "Allow all apps" method described above
- Make sure iTerm2 is running when you restart Claude
- Check System Settings → Privacy & Security → Automation

## Architecture

```
┌─────────────────┐
│  Claude Code /  │  
│  Claude Desktop │  
└────────┬────────┘
         │ MCP Protocol
         │ (JSON-RPC over stdio)
         ▼
┌─────────────────┐
│  MCP Server     │  
│  (Node.js)      │  
└────────┬────────┘
         │ AppleScript
         │ (session by ID)
         ▼
┌─────────────────┐
│    iTerm2       │  
│  (your shells)  │  
└─────────────────┘
```

## Development

### Running Tests

```bash
# Check if iTerm2 can be controlled
osascript -e 'tell application "iTerm2" to get version'

# End-to-end test: opens a scratch tab, runs echo/seq through the server, closes it
npm test
```

### Logs

```bash
# Watch MCP server logs
tail -f ~/Library/Logs/Claude/mcp-server-iterm2.log
```

### Future Improvements

- [x] Multi-session support (target sessions by ID) — v0.2.0
- [x] Quote/special character handling — v0.2.0
- [ ] Multi-line commands (needs a staging approach that doesn't press Enter per line)
- [ ] Command history tracking
- [ ] Integration with tmux/screen
- [ ] Python API integration for better reliability

## Contributing

Improvements welcome! Key areas:

- Safe multi-line staging
- Prompt detection for more shells/devices
- Tests and documentation

## License

MIT

## Credits

Built with:
- **MCP SDK** - Model Context Protocol from Anthropic
- **AppleScript** - macOS automation
- **iTerm2** - Best terminal for macOS
- **Node.js** - Runtime environment

## Acknowledgments

Special thanks to the community for testing and feedback during development!
