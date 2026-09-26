@echo off
setlocal
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js and npm are required to start the local game.
  pause
  exit /b 1
)

if not exist "node_modules\.bin\vite.cmd" (
  echo Project dependencies are missing. Run npm install once in this folder.
  pause
  exit /b 1
)

echo Starting Splendor in the default browser...
call npm run dev:local -- --host 127.0.0.1 --open
if errorlevel 1 (
  echo The local game could not start.
  pause
  exit /b 1
)
