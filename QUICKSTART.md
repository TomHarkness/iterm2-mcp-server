# Quick Start Guide

Get up and running with iTerm2 MCP Server in 5 minutes!

## Prerequisites

- macOS (tested on macOS 10.15+)
- iTerm2 installed
- Node.js 18+ installed
- Claude Desktop app installed

## Installation (3 steps + 1 setup)

### 1. Run the installer

```bash
cd iterm2-mcp-server
./install.sh
```

This will:
- Auto-detect your Node.js (handles nvm!)
- Install npm dependencies
- Show you the exact config
- Give you the full Node path to use

### 2. Add to Claude Desktop config

The installer shows you exactly what to add. Edit:

`~/Library/Application Support/Claude/claude_desktop_config.json`

**CRITICAL:** Use the **full path** to Node (not just `"node"`):

```json
{
  "mcpServers": {
    "iterm2": {
      "command": "/Users/yourname/.nvm/versions/node/v20.20.0/bin/node",
      "args": ["/Users/yourname/iterm2-mcp-server/index.js"]
    }
  }
}
```

**Why the full path?** Claude Desktop doesn't load your shell's nvm environment, so `"node"` might use an old version. The full path ensures it uses Node 18+.

### 3. Set up iTerm2 Automation (One-Time)

**This is required for initial setup:**

1. Open **iTerm2 Preferences** (⌘,)
2. Go to **General → Magic**
3. Change **"Require 'Automation' permission"** dropdown to: **"Allow all apps to connect"**
4. **Restart iTerm2** (⌘Q, reopen)

### 4. Restart Claude Desktop

- **Quit completely**: ⌘Q (not just close window)
- **Reopen** Claude Desktop

## First Use

1. **Open iTerm2** with at least one terminal session

2. **Open Claude Desktop** and start a new chat

3. **Try:** "List my iTerm sessions"

4. **Test the workflow:**
   ```
   You: "Check my current directory"
   Claude: [types "pwd" in your terminal]
   Claude: "I've typed pwd. Should I execute it?"
   You: "yes"
   Claude: [presses Enter, shows result]
   ```

5. **Lock down security again:**
   - Go back to iTerm2 Preferences → General → Magic
   - Change back to **"Require 'Automation' permission"**
   - This one-time setup registered Claude's access

## Example Session

```
You: List my iTerm sessions

Claude: I can see 1 session:
• ~ (-zsh) - /dev/ttys000

You: Show me what's in my home directory

Claude: I've typed "ls -la ~" in your terminal.
Should I execute this command?

You: Yes

Claude: [executes, shows output]
I can see your home directory contains...
```

## Current Limitations

**Single Session:** Commands go to the currently focused iTerm2 session only. Switch to the session you want to use before asking Claude to run commands.

**Why?** macOS automation permissions make multi-session targeting difficult. This is the most reliable approach.

## Tips

- **Keep iTerm2 visible** while using Claude so you can see commands
- **Switch to the right tab** before asking Claude to run commands there
- **Avoid emojis** in commands (they can cause quoting issues)
- **One command at a time** works best

## Troubleshooting

### Can't find Node or wrong version

The installer auto-detects Node. If it fails:

```bash
# Check your Node version
node --version  # Should be 18+

# If using nvm
nvm use 20
which node  # Use this full path in config

# If not installed
brew install node  # macOS with Homebrew
```

### Commands don't appear

1. Make sure iTerm2 window is focused
2. Click in the terminal to activate it
3. Try: "List my sessions" first to test connection

### "Server disconnected"

Check logs:
```bash
tail -f ~/Library/Logs/Claude/mcp-server-iterm2.log
```

Common causes:
- Node version < 18
- Wrong path in config
- iTerm2 automation not set up

### Permission issues

1. Set iTerm2 to "Allow all apps to connect" temporarily
2. Restart both iTerm2 and Claude Desktop
3. Use Claude once
4. Lock down automation again

## What's Next?

- Read the full [README.md](README.md) for all features
- Check out [ARCHITECTURE.md](ARCHITECTURE.md) to understand how it works
- Try more complex tasks like SSH sessions

## Common Use Cases

### Local Development
```
"Run my test suite"
"Check if port 3000 is in use"
"Show me git status"
```

### Remote Management
```
"SSH to my server and check disk space"
"List running docker containers"
"Check nginx status"
```

### System Tasks
```
"Show me system resources"
"Find large files in this directory"
"Check what's using high CPU"
```

## Getting Help

If you run into issues:

1. Check iTerm2 automation is set to "Allow all apps" temporarily
2. Verify Node.js 18+ with `node --version`
3. Check the logs: `~/Library/Logs/Claude/mcp-server-iterm2.log`
4. Make sure you're using the **full path** to node in your config

Enjoy your AI terminal assistant! 🚀
