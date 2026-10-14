#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * iTerm2 MCP Server
 * Provides tools to interact with iTerm2 sessions with approval workflow
 */

class ITerm2Server {
  constructor() {
    this.server = new Server(
      {
        name: "iterm2-mcp-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.pendingCommands = new Map();
  }

  /**
   * Sanitize command for AppleScript execution
   * Handles quotes and special characters safely
   */
  sanitizeCommand(command) {
    // Replace special characters that cause issues in AppleScript
    return command
      .replace(/\\/g, '\\\\')   // Escape backslashes first
      .replace(/"/g, '\\"')      // Escape double quotes
      .replace(/'/g, "'\\''");   // Escape single quotes for shell
  }

  /**
   * Build an AppleScript that finds a session by ID and runs innerScript inside it
   */
  buildSessionTargetScript(sessionId, innerScript) {
    return `
      tell application "iTerm2"
        set targetSession to missing value
        repeat with aWindow in windows
          repeat with aTab in tabs of aWindow
            repeat with aSession in sessions of aTab
              if id of aSession is "${sessionId}" then
                set targetSession to aSession
              end if
            end repeat
          end repeat
        end repeat
        if targetSession is missing value then
          error "Session not found: ${sessionId}"
        end if
        tell targetSession
          ${innerScript}
        end tell
      end tell
    `;
  }

  /**
   * Execute AppleScript to control iTerm2
   */
  async executeAppleScript(script) {
    try {
      const { stdout, stderr } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
      if (stderr) {
        console.error("AppleScript stderr:", stderr);
      }
      return stdout.trim();
    } catch (error) {
      // Log error to stderr for debugging but don't crash
      console.error("AppleScript execution failed:", error.message);
      console.error("This is often a permissions issue. Check System Preferences → Privacy & Security → Automation");
      throw new Error(`AppleScript execution failed: ${error.message}. You may need to grant automation permissions.`);
    }
  }

  /**
   * Get list of iTerm2 windows and sessions
   */
  async listSessions() {
    const script = `
      tell application "iTerm2"
        set sessionList to {}
        repeat with aWindow in windows
          repeat with aTab in tabs of aWindow
            repeat with aSession in sessions of aTab
              set sessionInfo to {name:(name of aSession), tty:(tty of aSession), id:(id of aSession)}
              set end of sessionList to sessionInfo
            end repeat
          end repeat
        end repeat
        return sessionList
      end tell
    `;

    try {
      const result = await this.executeAppleScript(script);
      return this.parseSessionList(result);
    } catch (error) {
      throw new Error(`Failed to list sessions: ${error.message}`);
    }
  }

  /**
   * Parse AppleScript session list output
   */
  parseSessionList(output) {
    if (!output || output === "") {
      return [];
    }

    // AppleScript returns format like: "name:bash, tty:/dev/ttys001, id:w0t0p0:12345"
    const sessions = [];
    const items = output.split(", id:");
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.includes("name:") && item.includes("tty:")) {
        const nameMatch = item.match(/name:([^,]+)/);
        const ttyMatch = item.match(/tty:([^,]+)/);
        
        let id = "";
        if (i < items.length - 1) {
          id = items[i + 1].split(",")[0];
        } else {
          const idMatch = item.match(/id:(.+)$/);
          if (idMatch) id = idMatch[1];
        }

        if (nameMatch && ttyMatch) {
          sessions.push({
            name: nameMatch[1].trim(),
            tty: ttyMatch[1].trim(),
            id: id.trim()
          });
        }
      }
    }

    return sessions;
  }

  /**
   * Send command to specific iTerm2 session
   */
  async sendCommandToSession(sessionId, command, executeNow = false) {
    const safeCommand = this.sanitizeCommand(command);
    const script = this.buildSessionTargetScript(
      sessionId,
      `write text "${safeCommand}"${executeNow ? '' : ' without newline'}`
    );

    try {
      await this.executeAppleScript(script);
      return { success: true, sessionId, command };
    } catch (error) {
      throw new Error(`Failed to send command: ${error.message}`);
    }
  }

  /**
   * Read current output from session
   */
  async readSessionOutput(sessionId, lines = 20) {
    const script = this.buildSessionTargetScript(sessionId, `get contents`);

    try {
      const output = await this.executeAppleScript(script);
      const outputLines = output.split('\n').slice(-lines);
      return outputLines.join('\n');
    } catch (error) {
      throw new Error(`Failed to read output: ${error.message}`);
    }
  }

  /**
   * Create a new iTerm2 tab
   */
  async createNewTab() {
    const script = `
      tell application "iTerm2"
        tell current window
          create tab with default profile
        end tell
      end tell
    `;

    try {
      await this.executeAppleScript(script);
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to create tab: ${error.message}`);
    }
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "list_iterm_sessions",
          description: "List all active iTerm2 windows, tabs, and sessions. Shows session names, TTYs, and IDs.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "propose_command",
          description: "Propose a command to run in an iTerm2 session. The command will be typed but NOT executed until user approves. This allows the user to see and review the command before it runs.",
          inputSchema: {
            type: "object",
            properties: {
              session_id: {
                type: "string",
                description: "The session ID to send the command to (from list_iterm_sessions)",
              },
              command: {
                type: "string",
                description: "The command to propose (will be typed but not executed)",
              },
              description: {
                type: "string",
                description: "Brief description of what this command does and why you want to run it",
              },
            },
            required: ["session_id", "command", "description"],
          },
        },
        {
          name: "execute_command",
          description: "Execute a previously proposed command (sends Enter key). Only use this after the user has explicitly approved the command.",
          inputSchema: {
            type: "object",
            properties: {
              session_id: {
                type: "string",
                description: "The session ID where the command was proposed",
              },
            },
            required: ["session_id"],
          },
        },
        {
          name: "read_session_output",
          description: "Read the recent output from an iTerm2 session to see results of commands.",
          inputSchema: {
            type: "object",
            properties: {
              session_id: {
                type: "string",
                description: "The session ID to read from",
              },
              lines: {
                type: "number",
                description: "Number of lines to read (default: 20)",
                default: 20,
              },
            },
            required: ["session_id"],
          },
        },
        {
          name: "create_new_tab",
          description: "Create a new iTerm2 tab with the default profile",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "clear_proposed_command",
          description: "Clear a proposed command from the terminal (removes the typed text)",
          inputSchema: {
            type: "object",
            properties: {
              session_id: {
                type: "string",
                description: "The session ID to clear",
              },
            },
            required: ["session_id"],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "list_iterm_sessions": {
            const sessions = await this.listSessions();
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(sessions, null, 2),
                },
              ],
            };
          }

          case "propose_command": {
            const { session_id, command, description } = args;
            
            // Send command without executing (no newline)
            await this.sendCommandToSession(session_id, command, false);
            
            // Store the pending command
            this.pendingCommands.set(session_id, { command, description });

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    status: "proposed",
                    message: `Command proposed in session ${session_id}. The user can now see it in their terminal.`,
                    description,
                    command,
                    next_step: "Ask the user if they approve. If yes, call execute_command. If no, call clear_proposed_command.",
                  }, null, 2),
                },
              ],
            };
          }

          case "execute_command": {
            const { session_id } = args;

            const script = this.buildSessionTargetScript(session_id, `write text ""`);
            await this.executeAppleScript(script);
            
            const pending = this.pendingCommands.get(session_id);
            this.pendingCommands.delete(session_id);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    status: "executed",
                    message: `Command executed in session ${session_id}`,
                    command: pending?.command || "unknown",
                  }, null, 2),
                },
              ],
            };
          }

          case "read_session_output": {
            const { session_id, lines = 20 } = args;
            const output = await this.readSessionOutput(session_id, lines);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    session_id,
                    output,
                  }, null, 2),
                },
              ],
            };
          }

          case "create_new_tab": {
            await this.createNewTab();
            
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    status: "created",
                    message: "New iTerm2 tab created",
                  }, null, 2),
                },
              ],
            };
          }

          case "clear_proposed_command": {
            const { session_id } = args;

            // ASCII character 21 = Ctrl+U, clears the current line
            const script = this.buildSessionTargetScript(
              session_id,
              `write text (ASCII character 21) without newline`
            );
            await this.executeAppleScript(script);
            this.pendingCommands.delete(session_id);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    status: "cleared",
                    message: "Proposed command cleared",
                  }, null, 2),
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error.message,
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("iTerm2 MCP server running on stdio");
  }
}

// Start the server
const server = new ITerm2Server();

// Add global error handlers to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

server.run().catch(console.error);
