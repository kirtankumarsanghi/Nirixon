@echo off
REM Starts the Nirixon API from anywhere. Keep this window open.
cd /d "%~dp0backend"

if not exist "%~dp0.venv\Scripts\python.exe" (
  echo Could not find .venv\Scripts\python.exe
  echo Run this once from the repo root:
  echo   python -m venv .venv
  echo   .venv\Scripts\python.exe -m pip install -r backend\requirements-ml.txt -r backend\requirements.txt
  pause
  exit /b 1
)

echo Stopping anything already on port 8000...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8000" ^| findstr "LISTENING"') do (
  taskkill /PID %%P /F >nul 2>&1
)

echo Starting Nirixon API on http://0.0.0.0:8000 ...
echo Keep this window open. Press Ctrl+C to stop.
"%~dp0.venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000
pause
