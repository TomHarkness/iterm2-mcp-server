#!/bin/bash

# Test script to verify iTerm2 MCP Server setup

echo "🧪 Testing iTerm2 MCP Server Setup"
echo "==================================="
echo ""

# Test 1: Check Node.js
echo "Test 1: Node.js installation"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "✅ Node.js found: $NODE_VERSION"
else
    echo "❌ Node.js not found"
    exit 1
fi
echo ""

# Test 2: Check dependencies
echo "Test 2: Dependencies"
if [ -d "node_modules" ]; then
    echo "✅ node_modules folder exists"
else
    echo "❌ Dependencies not installed. Run: npm install"
    exit 1
fi
echo ""

# Test 3: Check iTerm2
echo "Test 3: iTerm2"
if pgrep -x "iTerm2" > /dev/null; then
    echo "✅ iTerm2 is running"
else
    echo "⚠️  iTerm2 is not running"
fi
echo ""

# Test 4: Test AppleScript access
echo "Test 4: AppleScript access to iTerm2"
if osascript -e 'tell application "iTerm2" to get name' &> /dev/null; then
    echo "✅ Can communicate with iTerm2 via AppleScript"
else
    echo "❌ Cannot communicate with iTerm2"
    echo "   Please enable automation in System Preferences"
fi
echo ""

# Test 5: Check Claude config
CONFIG_FILE="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
echo "Test 5: Claude Desktop configuration"
if [ -f "$CONFIG_FILE" ]; then
    echo "✅ Config file exists"
    if grep -q "iterm2" "$CONFIG_FILE"; then
        echo "✅ iTerm2 MCP server configured"
    else
        echo "⚠️  iTerm2 MCP server not yet configured"
        echo "   Run ./install.sh to add configuration"
    fi
else
    echo "⚠️  Claude Desktop config not found"
    echo "   Run ./install.sh to create it"
fi
echo ""

# Test 6: Try listing sessions
echo "Test 6: Attempting to list iTerm2 sessions"
SCRIPT='
tell application "iTerm2"
    set sessionCount to 0
    repeat with aWindow in windows
        repeat with aTab in tabs of aWindow
            repeat with aSession in sessions of aTab
                set sessionCount to sessionCount + 1
            end repeat
        end repeat
    end repeat
    return sessionCount
end tell
'

SESSION_COUNT=$(osascript -e "$SCRIPT" 2>/dev/null || echo "0")
if [ "$SESSION_COUNT" -gt 0 ]; then
    echo "✅ Found $SESSION_COUNT iTerm2 session(s)"
else
    echo "⚠️  No iTerm2 sessions found (or cannot access)"
fi
echo ""

echo "=================================="
echo "Test Summary"
echo "=================================="
echo "If all tests passed ✅, you're ready to use the server!"
echo ""
echo "Next steps:"
echo "1. Make sure Claude Desktop is configured (see install.sh)"
echo "2. Restart Claude Desktop"
echo "3. Try: 'List my iTerm sessions'"
echo ""
