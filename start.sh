#!/usr/bin/env bash
# ⚡ TaskForge Quick Start Script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

chmod +x "$SCRIPT_DIR/taskforge.sh"
exec "$SCRIPT_DIR/taskforge.sh" start "$@"
