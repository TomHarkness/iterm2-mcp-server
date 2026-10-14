# iterm2-mcp-server

MCP server that lets Claude stage, run and read commands in iTerm2 sessions with a
human approval step. Single file: `index.js` (Node ≥18, ESM, `@modelcontextprotocol/sdk`,
AppleScript via `osascript` run with `execFile` — no shell in between).

## Invariants — don't break these
- **Approval gate:** `propose_command` types without Enter; `execute_command` is only called
  after the user approves. Never add a tool that types-and-runs in one step.
- **No stacking:** refuse to propose while a command is staged in that session (concatenates
  onto the pending line) unless `replace: true`.
- **No multi-line staging:** each newline in `write text` presses Enter, i.e. runs that line
  before approval.
- **Never target Claude's own terminal** (detected by walking the parent-process TTY).

## How it works
- Sessions are addressed by iTerm2 session `id` (`inSession()` loops windows/tabs/sessions).
- `contents` returns the whole buffer **including scrollback** (despite the sdef saying
  "visible"). `diffScreens()` finds the last few lines of the previous snapshot in the new
  buffer and returns what follows → `read_session_output mode:"new"` and `execute_command`.
- `execute_command` polls `contents` (~170 ms per osascript call) until the last line looks
  like a prompt (`DEFAULT_PROMPT_RE`, right-aligned prompt segments stripped) and is stable
  300 ms, or output is unchanged for `settle_ms`, or `timeout_s`.
- Output is plain text, blank runs collapsed, capped by `max_chars` keeping the newest lines.

## Testing
- `npm test` → `tools/smoke-test.mjs`: opens a scratch local tab, runs harmless echo/seq
  commands through the real server over stdio, closes the tab. Run it after any change.
- `./test.sh` checks Node + AppleScript permissions.
- `tools/usage.py`, `tools/usage2.py`: tool-call counts, output sizes, re-read redundancy
  and timing mined from Claude Code transcripts (`~/.claude/projects`). Baseline in `PLAN.md`.

Changes take effect only after the MCP server restarts (Claude Code: `/mcp` → reconnect or
new session; Claude Desktop: quit and reopen).
