@echo off
cd /d "%~dp0"
echo ----------------------------------------------
echo CloudVault FYP - Simple One Website Starter
echo ----------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js 22 or newer from nodejs.org.
  pause
  exit /b 1
)
node start.js
if errorlevel 1 echo CloudVault could not start. Read the error above.
pause
