#!/bin/sh

# Install script for POS Agent on Linux

echo "Installing POS Agent..."

# 1. Create directory
INSTALL_DIR="$HOME/.local/share/pos-agent"
mkdir -p "$INSTALL_DIR"

# 2. Extract binary
cp pos-agent "$INSTALL_DIR/"
cp config.json "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/pos-agent"

# 3. Request service enable via the agent itself
# We run the agent briefly to trigger the service install
"$INSTALL_DIR/pos-agent" --install-service

echo "Installation complete!"
echo "Run 'systemctl --user start pos-agent' to start."
