# iTerm2 MCP — efficiency plan (2026-10-14)

> Status: items 1–5 shipped in v0.2.0 (see CHANGELOG). Item 4's "remember last session" and
> own-terminal detection shipped; duplicate-registration cleanup is local housekeeping.

## Baseline (all Claude Code transcripts on this Mac, 10 sessions)

| Tool | Calls | Result chars total | Avg | Max |
|---|---:|---:|---:|---:|
| read_session_output | 387 | 668,770 | 1,728 | 33,107 |
| propose_command | 287 | 109,606 | 379 | 1,313 |
| execute_command | 270 | 40,048 | 148 | 277 |
| list_iterm_sessions | 39 | 18,743 | 480 | 1,147 |
| clear / new_tab | 9 | ~600 | | |

~837K chars (~210K tokens) of tool output. **Reads are 80% of it.**

Findings:
- **Redundant re-reads.** 162 read→read back-to-back. In 90/358 follow-up reads, >80% of
  lines had already been seen in the previous read of that session. Median overlap 41%.
- **Reading too early.** execute→first read median 3.5 s (p25 2.4 s), then re-read. Classic
  poll-until-done pattern, paid for in full screens each time.
- **Fixed workflow.** propose→execute (268), execute→read (192), read→propose (192). Almost
  every command is a 3-call round trip.
- **Boilerplate responses.** propose echoes the command back plus a `next_step` paragraph
  every call (~110K chars total). All results are pretty-printed JSON; reads escape `\n`/`"`.
- **lines arg is guesswork.** 20/10/15/8/30/6/40/150… the model can't know how much is new.
- list_iterm_sessions called 20× in one session (lost track of IDs / stale ID errors).
- 2 propose errors: one `'` escaping bug, one stale session ID.

## Changes, in priority order

### 1. Delta reads (biggest win)
`read_session_output` gains `mode: "new" | "tail"` (default `new`). Server keeps per-session
last-read snapshot; returns only lines after the last-seen anchor (match the previous
last few non-blank lines in the new buffer). Falls back to tail-N if the anchor scrolled
away, and says so. Read from scrollback (`text`/`contents` — check which one iTerm2 gives for
scrollback vs visible) so long outputs aren't lost.
Expected: cuts most of the 90 redundant reads' cost; makes the `lines` guess irrelevant.

### 2. Execute-and-wait
`execute_command` gains optional `wait`: wait until output stops changing for `settle_ms`
(default ~800 ms) or a prompt regex matches (`[$#>] ?$`, Junos `user@host>`, `pm3 -->`),
with `timeout_s` (default 15). Returns the new output directly (via the delta logic, capped).
Approval gate unchanged: still only called after the user says run.
Expected: removes most execute→read and read→read calls (~350 calls) and the 3.5 s
"read too early" pattern.

### 3. Lean output
- Plain text, not pretty JSON. propose → `staged in <name> (<id>)`. execute → `ran` +
  output. Move the "ask user, then execute/clear" guidance into the tool description once.
- Strip trailing whitespace and collapse runs of blank lines.
- `max_chars` cap (default ~4K) with a `[… N lines omitted, use mode:tail lines:N]` marker.
- Optional `grep` param on read (server-side filter) for noisy output (`show log`, etc.).

### 4. Session handling
- `list_iterm_sessions`: one line per session `id | name | tty | window/tab`, flag the pane
  Claude Code runs in (match `$TTY` / parent tty) so it's never picked.
- Remember last-used session; `session_id` optional thereafter.
- Session-not-found error says "re-run list_iterm_sessions" (and drop the permissions blurb).

### 5. Safety bugs (do these with #3)
- Refuse `propose_command` if that session already has a pending command unless
  `replace: true` (which clears first). Enforces the "never stage on top of pending" rule
  in code instead of relying on the model.
- `execute_command` with nothing pending → error, don't send a bare Enter.
- Fix quoting: run osascript with `execFile('osascript', ['-e', script])` (no shell), and
  escape only `\` and `"` for AppleScript. Fixes `'` commands.
- AppleScript loop: `exit repeat` once found (minor speed-up with many panes).

### 6. Hygiene
- `git init` + commit current state first, so changes are reviewable/revertable.
- Collapse duplicate MCP registrations to user scope only.
- Update README/CHANGELOG/ARCHITECTURE for session-ID targeting; bump version.

## Measuring
Re-run the transcript analysis after a few weeks of use and compare against the baseline above:
`python3 -I tools/usage.py` (call counts/sizes) and `python3 -I tools/usage2.py` (redundancy/timing).
Targets: read chars per executed command down ≥50%; calls per command ~2 (propose + execute).

## Order of work (one per session)
1. git init + safety bugs (#5) + lean output (#3)
2. Delta reads (#1)
3. Execute-and-wait (#2)
4. Session handling (#4) + docs (#6)
