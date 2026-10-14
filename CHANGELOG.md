# Changelog

## v0.2.0 — 2026-10-14

Efficiency and safety pass, driven by usage analysis of ~990 tool calls (reads were ~80% of tool-output tokens; a quarter of re-reads were mostly already-seen output; output was usually read ~3 s after execute, then polled).

- **Sessions targeted by ID** (since v0.1.x; docs updated). The terminal Claude runs in is detected and refused.
- **`execute_command` waits** for a prompt / settled output and returns the new output directly, with status and duration.
- **Delta reads:** `read_session_output` defaults to `mode: "new"`. `contents` includes scrollback, so long output isn't lost.
- **Lean output:** plain text instead of pretty JSON; blank runs collapsed; `max_chars` cap keeps newest; `grep` filter.
- **Safety:** refuses to stage on top of a pending command (`replace: true` to override); refuses multi-line and control-character commands (newlines would execute immediately); `execute_command` with nothing staged no longer sends a bare Enter.
- **Fixes:** commands containing `'` broke AppleScript (double shell-escaping) — osascript now runs via `execFile` with no shell. Error messages no longer blame automation permissions for every failure. `list_iterm_sessions` parsing no longer breaks on commas in session names.
- `tools/smoke-test.mjs` (end-to-end test in a scratch tab) and `tools/usage*.py` (usage analysis from Claude Code transcripts).

---

# 🎉 iTerm2 MCP Server - Updated & Fixed!

## What's New in v2

All the issues we discovered during setup have been fixed! This package now includes:

### ✅ Fixed Issues

1. **Node.js Version Detection** - Automatic detection of Node 18+ with nvm support
2. **Full Node Path** - Config now uses absolute paths to avoid version conflicts  
3. **Session Targeting** - Uses "current session" approach that actually works
4. **Better Error Handling** - Prevents crashes with improved AppleScript error messages
5. **Command Sanitization** - Better handling of special characters (though emojis still tricky)
6. **Clear Setup Instructions** - Step-by-step guide for iTerm2 automation permissions

### 📦 What's Included

```
iterm2-mcp-server/
├── index.js              - Main MCP server (FIXED: uses current session)
├── package.json          - Dependencies
├── install.sh            - IMPROVED: Auto-detects Node path
├── README.md             - UPDATED: All troubleshooting steps
├── QUICKSTART.md         - UPDATED: Correct setup process
├── ARCHITECTURE.md       - How it all works
└── test.sh              - Verify your setup
```

## Installation Summary

### Quick Install

```bash
cd iterm2-mcp-server
./install.sh
```

The installer now:
- ✅ Auto-detects Node.js 18+ (even with nvm)
- ✅ Shows you the EXACT config with full paths
- ✅ Guides you through iTerm2 automation setup
- ✅ Warns about common pitfalls

### Critical Steps

**1. Use Full Node Path**

❌ Wrong:
```json
{
  "mcpServers": {
    "iterm2": {
      "command": "node",  // DON'T DO THIS
      ...
    }
  }
}
```

✅ Correct:
```json
{
  "mcpServers": {
    "iterm2": {
      "command": "/Users/yourname/.nvm/versions/node/v20.20.0/bin/node",
      ...
    }
  }
}
```

**2. iTerm2 Automation Setup (One-Time)**

This is the trick we discovered:

1. Open iTerm2 Preferences → General → Magic
2. Set "Require 'Automation' permission" to **"Allow all apps to connect"**
3. Restart iTerm2
4. Restart Claude Desktop
5. Use Claude once ("list my sessions")
6. Change back to **"Require 'Automation' permission"**

**Why?** macOS won't show the permission dialog until iTerm2 allows automation. This one-time setup registers Claude's access, then you can lock it down.

## What We Fixed

### Issue 1: Node Version Conflicts

**Problem:** Claude Desktop used Node v10 instead of your nvm Node v20  
**Solution:** Use full path to Node in config

### Issue 2: Session Access Errors

**Problem:** AppleScript couldn't access sessions by ID (error -1728)  
**Solution:** Changed to use "current session of current window"

**Limitation:** Can only target the active session now, but it works reliably

### Issue 3: Permission Dialog Never Appeared

**Problem:** macOS wouldn't show automation permission dialog  
**Solution:** Temporarily allow all apps, use once, then lock down

### Issue 4: Server Crashes

**Problem:** Uncaught errors crashed the MCP server  
**Solution:** Added global error handlers and better error messages

### Issue 5: Quote Escaping

**Problem:** Emojis and special characters broke command execution  
**Solution:** Added sanitizeCommand() helper function

**Known Limitation:** Complex emojis still problematic - stick to ASCII

## Testing Your Setup

Run the test script:

```bash
cd iterm2-mcp-server
./test.sh
```

All checks should pass ✅

## Usage

### Basic Commands

```
You: "List my iTerm sessions"
Claude: [shows your sessions]

You: "Check disk space"
Claude: [types "df -h", asks for approval]
You: "yes"
Claude: [executes and shows results]
```

### Current Limitation

Commands go to the **currently focused** iTerm2 session. Switch to the right tab before asking Claude to run commands there.

**Why?** macOS automation permissions make multi-session targeting unreliable. Using "current session" works every time.

## File Changes

### install.sh
- ✅ Auto-detects Node 18+ with nvm
- ✅ Shows full Node path to use
- ✅ Guides through iTerm2 automation setup
- ✅ Better error messages

### index.js
- ✅ Uses "current session of current window" instead of session by ID
- ✅ Added sanitizeCommand() for better quote handling
- ✅ Global error handlers prevent crashes
- ✅ Better error messages for troubleshooting

### README.md
- ✅ Added "Current Limitations" section
- ✅ Expanded troubleshooting guide
- ✅ Node path setup clearly explained
- ✅ iTerm2 automation setup documented

### QUICKSTART.md
- ✅ Updated with correct setup flow
- ✅ One-time automation setup explained
- ✅ Full Node path emphasized
- ✅ Realistic examples

## Known Limitations

1. **Single Session Only** - Commands go to active session. Workaround: Switch tabs manually.

2. **No Multi-line Commands** - Keep commands on one line.

3. **Emoji Issues** - Special characters can cause problems. Use ASCII when possible.

4. **SSH Sessions** - Works great, but you need to SSH manually first, then Claude can run commands in that session.

## Verified Working

✅ List sessions  
✅ Propose commands  
✅ Execute commands  
✅ Read output  
✅ Works with SSH sessions  
✅ Create new tabs  
✅ Node 18+ support  
✅ macOS automation  

## Next Steps

After installation:

1. **Test it:** Ask Claude to "list my iTerm sessions"
2. **Try simple commands:** "Show current directory", "Check disk space"
3. **Lock down security:** Change iTerm2 back to "Require 'Automation' permission"
4. **Use it:** Ask Claude to help with terminal tasks!

## Future Improvements

- Multi-session targeting (when we find a reliable way)
- Better emoji/unicode handling
- Multi-line command support
- Tmux/screen integration
- Command history

## Support

If you hit issues:

1. Check logs: `tail -f ~/Library/Logs/Claude/mcp-server-iterm2.log`
2. Verify Node 18+: `node --version`
3. Check config uses full paths
4. Verify iTerm2 automation temporarily allowed
5. See README.md troubleshooting section

## Credits

Built and tested with help from the community. Special thanks to everyone who helped debug the Node version and permissions issues!

---

**Ready to use!** Download `iterm2-mcp-server-v2.tar.gz` and follow QUICKSTART.md 🚀
