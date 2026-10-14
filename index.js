#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Last non-blank line looks like a prompt: shell ($ # % >), Junos (user@host> / #),
// Cisco (host# / host>), pm3 (pm3 -->), Flipper (>:), Python (>>>), pagers (--More--),
// password and yes/no questions.
const DEFAULT_PROMPT_RE = /([$#%>❯]|-->|--More--|\(END\)|assword:|\?)\s*$/;

/**
 * iTerm2 MCP Server
 * Stage commands in iTerm2 sessions for user approval, run them, and read the results.
 * `contents` returns the session buffer including scrollback; "new output" is computed
 * by diffing it against the last snapshot returned for that session.
 */

class ITerm2Server {
  constructor() {
    this.server = new Server(
      { name: "iterm2-mcp-server", version: "0.2.0" },
      { capabilities: { tools: {} } }
    );
    this.pendingCommands = new Map(); // session_id -> command
    this.snapshots = new Map();       // session_id -> last screen lines seen by the model
    this.lastSessionId = null;
    this.ownTty = null;
    this.setupToolHandlers();
  }

  /** Escape for an AppleScript string literal (no shell involved). */
  asString(s) {
    return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }

  async osascript(script) {
    try {
      const { stdout } = await execFileAsync("osascript", ["-e", script], { maxBuffer: 16 * 1024 * 1024 });
      return stdout.replace(/\n$/, "");
    } catch (error) {
      const msg = (error.stderr || error.message || "").trim();
      if (/Session not found/.test(msg)) {
        throw new Error("Session not found (closed or stale ID). Run list_iterm_sessions.");
      }
      if (/not allowed|-1743|-10004/.test(msg)) {
        throw new Error(`Not permitted to control iTerm2: grant Automation permission in System Settings → Privacy & Security. (${msg})`);
      }
      throw new Error(`AppleScript failed: ${msg}`);
    }
  }

  /** Run innerScript inside `tell <session>` for the given session ID. */
  inSession(sessionId, innerScript) {
    return this.osascript(`
      tell application "iTerm2"
        repeat with aWindow in windows
          repeat with aTab in tabs of aWindow
            repeat with aSession in sessions of aTab
              if id of aSession is ${this.asString(sessionId)} then
                tell aSession
                  ${innerScript}
                end tell
                return
              end if
            end repeat
          end repeat
        end repeat
        error "Session not found"
      end tell
    `);
  }

  /** TTY of the terminal this server's client (e.g. Claude Code) is running in, if any. */
  async getOwnTty() {
    if (this.ownTty !== null) return this.ownTty;
    this.ownTty = "";
    let pid = process.ppid;
    for (let i = 0; i < 6 && pid > 1; i++) {
      try {
        const { stdout } = await execFileAsync("ps", ["-o", "tty=,ppid=", "-p", String(pid)]);
        const [tty, ppid] = stdout.trim().split(/\s+/);
        if (tty && tty !== "??") { this.ownTty = `/dev/${tty}`; break; }
        pid = Number(ppid);
      } catch { break; }
    }
    return this.ownTty;
  }

  async listSessions() {
    const out = await this.osascript(`
      tell application "iTerm2"
        set rowList to {}
        set w to 0
        repeat with aWindow in windows
          set w to w + 1
          set t to 0
          repeat with aTab in tabs of aWindow
            set t to t + 1
            repeat with aSession in sessions of aTab
              set end of rowList to (id of aSession) & tab & (tty of aSession) & tab & w & "/" & t & tab & (name of aSession)
            end repeat
          end repeat
        end repeat
        set AppleScript's text item delimiters to linefeed
        return rowList as text
      end tell
    `);
    return out.split("\n").filter(Boolean).map((row) => {
      const [id, tty, pos, ...name] = row.split("\t");
      return { id, tty, pos, name: name.join("\t") };
    });
  }

  async resolveSession(sessionId) {
    const id = sessionId || this.lastSessionId;
    if (!id) throw new Error("No session_id given and none used yet. Run list_iterm_sessions.");
    this.lastSessionId = id;
    return id;
  }

  async assertNotOwnSession(sessionId) {
    const own = await this.getOwnTty();
    if (!own) return;
    const tty = await this.inSession(sessionId, "return tty");
    if (tty === own) {
      throw new Error("Refusing: that session is the terminal Claude itself is running in. Pick another session.");
    }
  }

  async getScreen(sessionId) {
    return this.inSession(sessionId, "return contents");
  }

  /** Normalise screen text: right-trim lines, drop trailing blank lines. */
  screenLines(text) {
    const lines = text.split("\n").map((l) => l.replace(/\s+$/, ""));
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    return lines;
  }

  /**
   * Lines in `cur` that weren't in `prev`. `contents` is the whole buffer including
   * scrollback, so normally `cur` = `prev` + appended lines, except the previous last
   * line (the prompt) may have been edited and old lines may have been trimmed from
   * the top. Finds the last few lines of `prev` (an anchor) in `cur`, searching from
   * where they'd be with no trimming towards the top, and returns what follows.
   * lost=true means the anchor wasn't found (screen cleared / buffer reset).
   */
  diffScreens(prev, cur) {
    if (!prev || !prev.length) return { lines: cur, lost: false };
    if (prev.length === cur.length && prev.every((l, i) => l === cur[i])) return { lines: [], lost: false };
    const keep = prev.slice(0, -1); // everything except the possibly-edited last line
    if (!keep.length) return { lines: cur, lost: false };
    const anchor = keep.slice(-5);
    const k = anchor.length;
    for (let j = Math.min(keep.length - k, cur.length - k); j >= 0; j--) {
      let ok = true;
      for (let i = 0; i < k; i++) if (cur[j + i] !== anchor[i]) { ok = false; break; }
      if (ok) return { lines: cur.slice(j + k), lost: false };
    }
    return { lines: cur, lost: true };
  }

  /** Collapse blank runs, apply grep, cap size (keeping the most recent output). */
  formatLines(lines, { grep, maxChars = 6000 } = {}) {
    let out = [];
    for (const l of lines) {
      if (!l && (!out.length || !out[out.length - 1])) continue;
      out.push(l);
    }
    if (grep) {
      let re;
      try { re = new RegExp(grep, "i"); } catch (e) { throw new Error(`Bad grep regex: ${e.message}`); }
      out = out.filter((l) => re.test(l));
    }
    let text = out.join("\n");
    if (text.length > maxChars) {
      const cut = text.length - maxChars;
      const dropped = text.slice(0, cut).split("\n").length;
      text = `[… ${dropped} earlier lines omitted; raise max_chars or use grep]\n` + text.slice(cut).replace(/^[^\n]*\n/, "");
    }
    return text;
  }

  async proposeCommand({ session_id, command, replace = false }) {
    const id = await this.resolveSession(session_id);
    if (/[\r\n]/.test(command)) {
      throw new Error("Multi-line commands can't be staged: each newline would press Enter and run that line immediately. Join with ; or &&, or write a script file and propose running it.");
    }
    if (/[\x00-\x08\x0b-\x1f\x7f]/.test(command)) {
      throw new Error("Command contains control characters; refusing to type it.");
    }
    await this.assertNotOwnSession(id);

    const pending = this.pendingCommands.get(id);
    if (pending !== undefined) {
      // If the user already ran or cleared it by hand, the prompt line no longer shows it.
      const last = this.screenLines(await this.getScreen(id)).pop() || "";
      if (!last.includes(pending)) {
        this.pendingCommands.delete(id);
      } else if (!replace) {
        throw new Error(`A command is already staged in this session: ${pending}\nExecute or clear it first, or pass replace: true.`);
      }
    }

    const clear = pending !== undefined && replace ? "write text (ASCII character 21) without newline\n" : "";
    await this.inSession(id, `${clear}write text ${this.asString(command)} without newline`);
    this.pendingCommands.set(id, command);
    return `Staged in ${id}: ${command}`;
  }

  async executeCommand({ session_id, wait = true, timeout_s = 20, settle_ms = 1200, prompt_regex, grep, max_chars }) {
    const id = await this.resolveSession(session_id);
    const command = this.pendingCommands.get(id);
    if (command === undefined) {
      throw new Error("Nothing staged in this session (propose_command first). Not sending Enter.");
    }
    const before = this.screenLines(await this.getScreen(id));
    await this.inSession(id, 'write text ""');
    this.pendingCommands.delete(id);
    if (!wait) {
      this.snapshots.set(id, before);
      return `Ran: ${command}`;
    }

    let promptRe = DEFAULT_PROMPT_RE;
    if (prompt_regex) {
      try { promptRe = new RegExp(prompt_regex); } catch (e) { throw new Error(`Bad prompt_regex: ${e.message}`); }
    }
    const start = Date.now();
    let last = null, lastChange = Date.now(), status = "timeout";
    await sleep(250);
    while (Date.now() - start < timeout_s * 1000) {
      const screen = await this.getScreen(id);
      if (screen !== last) { last = screen; lastChange = Date.now(); }
      const lines = this.screenLines(screen);
      const { lines: fresh } = this.diffScreens(before, lines);
      // Drop a right-aligned prompt segment (e.g. p10k's "3s" / clock) before matching.
      const tail = fresh.length > 1 ? fresh[fresh.length - 1].replace(/\s{3,}\S.*$/, "") : "";
      const stableFor = Date.now() - lastChange;
      if (tail && promptRe.test(tail) && stableFor >= 300) { status = "prompt"; break; }
      if (stableFor >= settle_ms && fresh.length > 1) { status = "settled"; break; }
      await sleep(200);
    }

    const cur = this.screenLines(last ?? (await this.getScreen(id)));
    const { lines, lost } = this.diffScreens(before, cur);
    this.snapshots.set(id, cur);
    const note = status === "timeout"
      ? `\n[still running after ${timeout_s}s — read_session_output for more]`
      : "";
    const lostNote = lost ? "[screen was cleared or buffer reset; showing everything visible]\n" : "";
    const secs = ((Date.now() - start) / 1000).toFixed(1);
    return `Ran (${status}, ${secs}s): ${command}\n${lostNote}${this.formatLines(lines, { grep, maxChars: max_chars })}${note}`;
  }

  async readOutput({ session_id, mode = "new", lines = 40, grep, max_chars }) {
    const id = await this.resolveSession(session_id);
    const cur = this.screenLines(await this.getScreen(id));
    const prev = this.snapshots.get(id);
    this.snapshots.set(id, cur);

    if (mode === "new" && prev) {
      const { lines: fresh, lost } = this.diffScreens(prev, cur);
      if (!fresh.length) return "[no new output]";
      const head = lost ? "[screen changed completely since last read; showing current screen]\n" : "";
      return head + this.formatLines(fresh, { grep, maxChars: max_chars });
    }
    return this.formatLines(cur.slice(-lines), { grep, maxChars: max_chars });
  }

  setupToolHandlers() {
    const sessionProp = {
      type: "string",
      description: "Session ID from list_iterm_sessions. Optional: defaults to the last session used.",
    };
    const outputProps = {
      grep: { type: "string", description: "Only return lines matching this regex (case-insensitive)." },
      max_chars: { type: "number", description: "Cap on returned text, keeping the most recent (default 6000)." },
    };

    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "list_iterm_sessions",
          description: "List iTerm2 sessions: id, tty, window/tab, name. The session Claude itself runs in is marked and can't be targeted.",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "propose_command",
          description:
            "Type a single-line command into an iTerm2 session WITHOUT pressing Enter, for the user to review. " +
            "Then ask the user; call execute_command only after they approve, or clear_proposed_command if they decline. " +
            "Refuses if a command is already staged there (unless replace: true) and refuses multi-line commands.",
          inputSchema: {
            type: "object",
            properties: {
              session_id: sessionProp,
              command: { type: "string", description: "Single-line command to stage." },
              description: { type: "string", description: "One line: what it does and why." },
              replace: { type: "boolean", description: "Clear an already-staged command first (default false)." },
            },
            required: ["command"],
          },
        },
        {
          name: "execute_command",
          description:
            "Press Enter on the staged command (only after the user approved it). By default waits until the output " +
            "settles or a prompt returns, then returns just the new output — no separate read needed.",
          inputSchema: {
            type: "object",
            properties: {
              session_id: sessionProp,
              wait: { type: "boolean", description: "Wait for and return output (default true)." },
              timeout_s: { type: "number", description: "Max seconds to wait (default 20)." },
              settle_ms: { type: "number", description: "Treat output as done after this long unchanged (default 1200)." },
              prompt_regex: { type: "string", description: "Regex matching the prompt line, if the default guess doesn't fit." },
              ...outputProps,
            },
          },
        },
        {
          name: "read_session_output",
          description:
            "Read an iTerm2 session's screen. mode 'new' (default) returns only lines not already returned for this session; " +
            "'tail' returns the last N lines (scrollback included).",
          inputSchema: {
            type: "object",
            properties: {
              session_id: sessionProp,
              mode: { type: "string", enum: ["new", "tail"], description: "default 'new'" },
              lines: { type: "number", description: "Lines for mode 'tail', or first read of a session (default 40)." },
              ...outputProps,
            },
          },
        },
        {
          name: "create_new_tab",
          description: "Create a new iTerm2 tab (default profile) and return its session ID.",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "clear_proposed_command",
          description: "Clear the staged (unexecuted) command line in a session (Ctrl-U).",
          inputSchema: { type: "object", properties: { session_id: sessionProp } },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params;
      try {
        let text;
        switch (name) {
          case "list_iterm_sessions": {
            const [sessions, own] = await Promise.all([this.listSessions(), this.getOwnTty()]);
            text = sessions.length
              ? sessions.map((s) =>
                  `${s.id} | ${s.tty} | w${s.pos} | ${s.name}` +
                  (own && s.tty === own ? "  <- Claude's own terminal (don't use)" : "") +
                  (this.pendingCommands.has(s.id) ? `  [staged: ${this.pendingCommands.get(s.id)}]` : "")
                ).join("\n")
              : "No iTerm2 sessions.";
            break;
          }
          case "propose_command":
            text = await this.proposeCommand(args);
            break;
          case "execute_command":
            text = await this.executeCommand(args);
            break;
          case "read_session_output":
            text = await this.readOutput(args);
            break;
          case "create_new_tab": {
            const id = await this.osascript(`
              tell application "iTerm2"
                if (count of windows) is 0 then
                  set w to (create window with default profile)
                else
                  set w to current window
                  tell w to create tab with default profile
                end if
                return id of current session of w
              end tell
            `);
            this.lastSessionId = id;
            text = `Created tab, session ${id}`;
            break;
          }
          case "clear_proposed_command": {
            const id = await this.resolveSession(args.session_id);
            await this.inSession(id, "write text (ASCII character 21) without newline");
            this.pendingCommands.delete(id);
            text = "Cleared";
            break;
          }
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("iTerm2 MCP server running on stdio");
  }
}

const server = new ITerm2Server();

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled rejection at:", promise, "reason:", reason);
});

server.run().catch(console.error);
