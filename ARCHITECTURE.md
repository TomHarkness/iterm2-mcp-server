# Architecture Overview

## How It All Works

```
┌─────────────────────────────────────────────────────────────────┐
│                         YOU (The User)                          │
│                                                                 │
│  ┌─────────────────────┐              ┌─────────────────────┐  │
│  │   Claude Desktop    │              │      iTerm2         │  │
│  │   or claude.ai      │              │                     │  │
│  │                     │              │  ┌───────────────┐  │  │
│  │  "Check disk space  │              │  │ $ df -h       │  │  │
│  │   on my server"     │              │  │               │  │  │
│  │                     │              │  │ [WAITING...]  │  │  │
│  │  "Yes, execute it"  │              │  │               │  │  │
│  └──────────┬──────────┘              │  └───────────────┘  │  │
│             │                         └──────────▲──────────┘  │
│             │                                    │             │
└─────────────┼────────────────────────────────────┼─────────────┘
              │                                    │
              │ MCP Protocol                       │
              │ (JSON-RPC over stdio)              │
              │                                    │
              ▼                                    │
┌─────────────────────────────────────────────────┼─────────────┐
│           MCP Server (Node.js)                  │             │
│                                                 │             │
│  ┌──────────────────────────────────┐          │             │
│  │  Tools Available:                │          │             │
│  │  • list_iterm_sessions          │          │             │
│  │  • propose_command              │◄─────────┘             │
│  │  • execute_command              │                        │
│  │  • read_session_output          │          AppleScript   │
│  │  • create_new_tab               │          Commands      │
│  │  • clear_proposed_command       │                        │
│  └──────────────────────────────────┘                        │
│                                                               │
│  Approval Workflow:                                          │
│  1. propose_command  → Types command (no Enter)              │
│  2. User sees it in terminal                                 │
│  3. User approves in Claude chat                             │
│  4. execute_command  → Sends Enter key                       │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

## Sequence Diagram: Typical Interaction

```
You          Claude         MCP Server      iTerm2
│              │                │              │
│ "list my    │                │              │
│  sessions"  │                │              │
├─────────────►│                │              │
│              │ list_iterm_   │              │
│              │  sessions     │              │
│              ├───────────────►│              │
│              │                │ AppleScript  │
│              │                ├─────────────►│
│              │                │◄─────────────┤
│              │◄───────────────┤              │
│              │  [session list]│              │
│◄─────────────┤                │              │
│ "2 sessions  │                │              │
│  found..."   │                │              │
│              │                │              │
│ "check disk │                │              │
│  space"      │                │              │
├─────────────►│                │              │
│              │ propose_       │              │
│              │  command       │              │
│              ├───────────────►│              │
│              │  "df -h"       │              │
│              │                │ Type "df -h" │
│              │                │ (no Enter)   │
│              │                ├─────────────►│
│              │◄───────────────┤              │
│              │  [proposed]    │              │
│◄─────────────┤                │              │
│ "I've typed  │                │              │
│  df -h.      │                │              │
│  Execute?"   │                │              │
│              │                │              │
│ "yes"        │                │              │
├─────────────►│                │              │
│              │ execute_       │              │
│              │  command       │              │
│              ├───────────────►│              │
│              │                │ Send Enter   │
│              │                ├─────────────►│
│              │                │◄─────────────┤
│              │◄───────────────┤  (executes)  │
│              │  [executed]    │              │
│              │                │              │
│              │ read_session_  │              │
│              │  output        │              │
│              ├───────────────►│              │
│              │                │ Read output  │
│              │                ├─────────────►│
│              │                │◄─────────────┤
│              │◄───────────────┤              │
│              │  [output text] │              │
│◄─────────────┤                │              │
│ "Here's the  │                │              │
│  disk usage" │                │              │
│              │                │              │
```

## Key Design Decisions

### 1. **AppleScript over iTerm2 Python API**

**Why:** 
- Zero configuration needed (Python API requires setup)
- Works immediately with standard iTerm2
- Simpler for end users

**Trade-off:**
- Slightly slower than Python API
- Less robust error handling
- Limited to macOS

### 2. **Proposal + Approval Pattern**

**Why:**
- Security: Never auto-execute commands
- Visibility: User sees what will happen
- Control: User can abort or modify

**How it works:**
1. `propose_command` → Types without Enter
2. User reviews in terminal
3. `execute_command` → Sends Enter key
4. OR `clear_proposed_command` → Ctrl+U to cancel

### 3. **MCP Protocol over Custom API**

**Why:**
- Standard protocol supported by Claude
- No API keys or authentication needed
- Local-only communication
- Works with Claude Desktop out of the box

### 4. **Session ID-based Targeting**

**Why:**
- Supports multiple terminal windows/tabs
- Works with SSH sessions transparently
- User can direct Claude to specific terminals

**How:**
```javascript
// User has 3 sessions:
// 1. Local bash
// 2. SSH to server1
// 3. SSH to server2

// Claude can target any of them:
propose_command(session_id: "w0t1p0", command: "ls -la")
```

## File Organization

```
iterm2-mcp-server/
├── index.js              # Main MCP server implementation
├── package.json          # Node.js dependencies
├── README.md             # Full documentation
├── QUICKSTART.md         # Quick start guide
├── ARCHITECTURE.md       # This file
├── install.sh            # Automated installation
├── test.sh               # Verify setup
└── .gitignore           # Git ignore rules
```

## Security Model

### What's Protected

✅ **Command execution requires explicit approval**
- Commands are typed but not run automatically
- User must say "yes" in Claude chat

✅ **All actions visible**
- Every command appears in the terminal
- No hidden or background execution

✅ **Local-only**
- No network communication
- No data sent to external services
- MCP protocol over stdio (local process)

✅ **No credentials stored**
- Server doesn't save passwords or keys
- SSH sessions use existing connections

### What's Not Protected

⚠️ **Claude sees terminal output**
- After commands run, output is readable
- Sensitive data in output may be visible
- User should be mindful of what they approve

⚠️ **AppleScript permissions**
- Requires macOS automation permissions
- Once granted, can control iTerm2
- Standard macOS security model applies

## Future Improvements

### Short-term
- [ ] Better session name parsing
- [ ] Support for tab/window creation with specific profiles
- [ ] Command history tracking
- [ ] Multi-line command support

### Medium-term
- [ ] Switch to iTerm2 Python API for better reliability
- [ ] Support for tmux/screen within iTerm2
- [ ] Regex-based session filtering
- [ ] Command templates/snippets

### Long-term
- [ ] Support for other terminals (Alacritty, kitty)
- [ ] Record/replay command sequences
- [ ] Integration with system clipboard
- [ ] AI-suggested commands based on context

## Alternatives Considered

### 1. Direct Shell Integration
**Rejected because:** Requires installation on remote hosts

### 2. tmux/screen Multiplexer
**Rejected because:** More complex setup, not all users use multiplexers

### 3. Custom Terminal Emulator
**Rejected because:** Massive scope, users want to use iTerm2

### 4. Keyboard Automation (Hammerspoon/Karabiner)
**Rejected because:** Less reliable, harder to target specific sessions

## Contributing

See areas for improvement above. PRs welcome!

Key files:
- `index.js` - Main server logic
- `install.sh` - Installation script
- `README.md` - User documentation

## Questions?

Check the [README.md](README.md) or [QUICKSTART.md](QUICKSTART.md) for usage help.
