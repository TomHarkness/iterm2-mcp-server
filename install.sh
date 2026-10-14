#!/bin/bash

# iTerm2 MCP Server Installation Script
# Automates the setup process with improved Node.js detection

set -e  # Exit on error

echo "🚀 iTerm2 MCP Server Installation"
echo "=================================="
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
echo "📁 Installation directory: $SCRIPT_DIR"
echo ""

# Step 1: Detect Node.js
echo "📦 Step 1: Detecting Node.js..."
NODE_PATH=""

# Check for node in PATH
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    NODE_PATH=$(which node)
    echo "✅ Found Node.js $NODE_VERSION at: $NODE_PATH"
    
    # Check version (need 18+)
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
    if [ "$MAJOR_VERSION" -lt 18 ]; then
        echo "⚠️  Warning: Node.js $NODE_VERSION detected, but version 18+ is required"
        echo "   The MCP SDK requires Node.js 18 or higher"
        
        # Check for newer versions via nvm
        if [ -d "$HOME/.nvm/versions/node" ]; then
            echo ""
            echo "🔍 Found nvm installations. Checking for Node 18+..."
            NEWEST_NODE=$(find "$HOME/.nvm/versions/node" -maxdepth 1 -type d -name "v*" | sort -V | tail -1)
            if [ -n "$NEWEST_NODE" ]; then
                NEWEST_VERSION=$(basename "$NEWEST_NODE")
                NEWEST_MAJOR=$(echo $NEWEST_VERSION | cut -d'.' -f1 | sed 's/v//')
                if [ "$NEWEST_MAJOR" -ge 18 ]; then
                    NODE_PATH="$NEWEST_NODE/bin/node"
                    echo "✅ Will use Node.js $NEWEST_VERSION at: $NODE_PATH"
                fi
            fi
        fi
    fi
else
    echo "⚠️  Node.js not found in PATH"
    
    # Try to find via nvm
    if [ -d "$HOME/.nvm/versions/node" ]; then
        echo "🔍 Checking nvm installations..."
        NEWEST_NODE=$(find "$HOME/.nvm/versions/node" -maxdepth 1 -type d -name "v*" | sort -V | tail -1)
        if [ -n "$NEWEST_NODE" ]; then
            NODE_PATH="$NEWEST_NODE/bin/node"
            NODE_VERSION=$($NODE_PATH --version)
            echo "✅ Found Node.js $NODE_VERSION via nvm"
        fi
    fi
    
    # Try homebrew
    if [ -z "$NODE_PATH" ] && [ -f "/opt/homebrew/bin/node" ]; then
        NODE_PATH="/opt/homebrew/bin/node"
        NODE_VERSION=$($NODE_PATH --version)
        echo "✅ Found Node.js $NODE_VERSION via Homebrew"
    fi
    
    if [ -z "$NODE_PATH" ]; then
        echo "❌ Error: Could not find Node.js 18+"
        echo "   Please install Node.js from https://nodejs.org/"
        echo "   Or use: brew install node"
        exit 1
    fi
fi

echo ""

# Step 2: Install dependencies
echo "📦 Step 2: Installing dependencies..."
npm install
echo "✅ Dependencies installed"
echo ""

# Step 3: Make executable
echo "🔧 Step 3: Making server executable..."
chmod +x "$SCRIPT_DIR/index.js"
echo "✅ Server is now executable"
echo ""

# Step 4: Check iTerm2
echo "🖥️  Step 4: Checking iTerm2..."
if ! pgrep -x "iTerm2" > /dev/null; then
    echo "⚠️  iTerm2 is not currently running"
else
    echo "✅ iTerm2 is running"
fi

echo ""
echo "📋 IMPORTANT: iTerm2 Automation Setup"
echo "   You need to temporarily allow automation to set up permissions:"
echo ""
echo "   1. Open iTerm2 Preferences (⌘,)"
echo "   2. Go to: General → Magic"
echo "   3. Set 'Require Automation permission' to: Allow all apps to connect"
echo "   4. Use Claude once to interact with iTerm2"
echo "   5. Change back to: Require 'Automation' permission"
echo ""
echo "   This one-time setup allows macOS to register Claude's automation access."
echo ""

# Step 5: Configure Claude Desktop
CONFIG_FILE="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
echo "⚙️  Step 5: Configuring Claude Desktop..."

# Create config directory if it doesn't exist
mkdir -p "$HOME/Library/Application Support/Claude"

# Check if config file exists
if [ -f "$CONFIG_FILE" ]; then
    echo "📄 Config file exists at: $CONFIG_FILE"
else
    echo "📄 Creating new config file at: $CONFIG_FILE"
    echo '{
  "mcpServers": {}
}' > "$CONFIG_FILE"
    echo "✅ Config file created"
fi

echo ""
echo "📝 Add this configuration to your claude_desktop_config.json:"
echo ""
echo "{"
echo "  \"mcpServers\": {"
echo "    \"iterm2\": {"
echo "      \"command\": \"$NODE_PATH\","
echo "      \"args\": [\"$SCRIPT_DIR/index.js\"]"
echo "    }"
echo "  }"
echo "}"
echo ""
echo "⚠️  IMPORTANT: Use the FULL PATH to node shown above!"
echo "   This avoids Node version conflicts with nvm."
echo ""

# Offer to open config file
echo "Would you like to open the config file now? (y/n)"
read -r response
if [[ "$response" =~ ^[Yy]$ ]]; then
    if command -v code &> /dev/null; then
        code "$CONFIG_FILE"
    elif command -v nano &> /dev/null; then
        nano "$CONFIG_FILE"
    else
        open -a TextEdit "$CONFIG_FILE"
    fi
fi

echo ""
echo "✅ Installation complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Add the config above to: $CONFIG_FILE"
echo "   2. Make sure to use the FULL node path (not just 'node')"
echo "   3. Set iTerm2 to 'Allow all apps to connect' temporarily"
echo "   4. Restart Claude Desktop app (⌘Q then reopen)"
echo "   5. Start chatting with Claude: 'List my iTerm sessions'"
echo "   6. After first successful use, lock down iTerm2 automation again"
echo ""
echo "💡 First test: Ask Claude to 'list my iTerm sessions'"
echo ""
