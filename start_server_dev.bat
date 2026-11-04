@echo off
setlocal
rem Development-only launcher: enables host-only class cheats for local testing.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js 22 or newer is required. Install it from https://nodejs.org and try again.
    pause
    exit /b 1
)
if not exist node_modules (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ERROR: npm install failed.
        pause
        exit /b 1
    )
)
set "DIEP_DEV_CHEATS=1"
call npm start
pause
