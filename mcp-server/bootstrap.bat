@echo off
echo Setting up Portable Python MCP Mount Engine...
python -m venv .venv
call .venv\Scripts\activate.bat
pip install -r requirements.txt
echo Setup complete.
echo To start the Mount Engine run:
echo .venv\Scripts\activate.bat ^&^& python server.py
