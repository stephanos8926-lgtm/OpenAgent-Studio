#!/bin/bash
set -e
echo "Setting up Portable Python MCP Mount Engine..."
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
echo "Setup complete."
echo "To start the Mount Engine run:"
echo "source .venv/bin/activate && python server.py"
