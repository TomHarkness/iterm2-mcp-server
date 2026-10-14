// Drives index.js over stdio against a scratch iTerm2 tab it creates and closes.
// Usage: node tools/smoke-test.mjs   (opens a local tab; touches no other session)
import { spawn } from "child_process";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const srv = spawn(process.execPath, [fileURLToPath(new URL("../index.js", import.meta.url))], { stdio: ["pipe", "pipe", "inherit"] });
let buf = "", nextId = 1; const waiters = new Map();
srv.stdout.on("data", (d) => {
  buf += d; let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const msg = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
    waiters.get(msg.id)?.(msg); waiters.delete(msg.id);
  }
});
const rpc = (method, params) => new Promise((res) => { const id = nextId++; waiters.set(id, res); srv.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
const call = async (name, args = {}) => { const r = await rpc("tools/call", { name, arguments: args }); return { err: !!r.result.isError, text: r.result.content[0].text }; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (label, ok, detail) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : "\n      " + detail.replace(/\n/g, "\n      ")}`); };

await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "0" } });
const tools = (await rpc("tools/list", {})).result.tools.map((t) => t.name);
check("tools/list has 6 tools", tools.length === 6, tools.join(","));

let r = await call("create_new_tab");
const sid = r.text.match(/session (\S+)/)?.[1];
check("create_new_tab returns session id", !!sid, r.text);
await sleep(2500); // let the shell print its prompt
try {
  r = await call("list_iterm_sessions");
  check("list includes scratch session", r.text.includes(sid), r.text);

  r = await call("propose_command", { session_id: sid, command: `printf '%s\\n' "it's \\"q\\" \\\\ ok"`, description: "quote test" });
  check("propose with ' \" \\ succeeds", !r.err, r.text);
  r = await call("propose_command", { command: "echo second" });
  check("propose on top of pending is refused", r.err && /already staged/.test(r.text), r.text);
  r = await call("execute_command", {});
  check("execute returns quoted output verbatim", !r.err && r.text.includes(`it's "q" \\ ok`), r.text);
  console.log("      ---\n      " + r.text.replace(/\n/g, "\n      "));

  r = await call("execute_command", {});
  check("execute with nothing staged is refused", r.err && /Nothing staged/.test(r.text), r.text);
  r = await call("propose_command", { command: "echo a\necho b" });
  check("multi-line propose is refused", r.err && /Multi-line/.test(r.text), r.text);

  r = await call("propose_command", { command: "for i in 1 2 3; do echo line$i; sleep 1; done" });
  const t0 = Date.now();
  r = await call("execute_command", {});
  check(`execute waits for slow output (${Date.now() - t0}ms, ${r.text.split("\n")[0]})`, /line1[\s\S]*line3/.test(r.text), r.text);
  r = await call("read_session_output", {});
  check("read mode=new after execute: nothing new", r.text === "[no new output]", r.text);

  await call("propose_command", { command: "seq 1 300" });
  r = await call("execute_command", {});
  check("long output returned whole (1..300)", /\n1\n/.test(r.text) && /\n300\n/.test(r.text) && !/omitted/.test(r.text), r.text.slice(-300));

  await call("propose_command", { command: "seq 1 5000" });
  r = await call("execute_command", {});
  check("huge output capped, newest kept", /omitted/.test(r.text) && /\n5000\n/.test(r.text) && r.text.length < 6300, `len=${r.text.length} ${r.text.slice(0, 200)}`);

  await call("propose_command", { command: "seq 1 50 | sed 's/^/row /'" });
  r = await call("execute_command", { grep: "row 4[0-9]" });
  check("grep filter", r.text.split("\n").filter((l) => /^row/.test(l)).length === 10, r.text);

  await call("propose_command", { command: "echo staged-then-cleared" });
  r = await call("clear_proposed_command", {});
  r = await call("propose_command", { command: "echo after-clear" });
  check("propose works after clear", !r.err, r.text);
  await call("clear_proposed_command", {});

  r = await call("read_session_output", { mode: "tail", lines: 5 });
  check("tail mode returns <=5 lines", !r.err && r.text.split("\n").length <= 5, r.text);

  const own = (await call("list_iterm_sessions")).text.split("\n").find((l) => l.includes("Claude's own"));
  if (own) {
    r = await call("propose_command", { session_id: own.split(" | ")[0], command: "echo nope" });
    check("refuses Claude's own terminal", r.err && /Claude itself/.test(r.text), r.text);
  } else console.log("SKIP  own-terminal check (not run from an iTerm2 pane)");
} finally {
  if (sid) execFileSync("osascript", ["-e", `tell application "iTerm2" to repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        if id of s is "${sid}" then close s
      end repeat
    end repeat
  end repeat`]);
  srv.kill();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
