@echo off
rem STEEL VANGUARD quick start - serves at http://localhost:18081
cd /d "%~dp0"

rem Already running? Just open the browser.
set "PID="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":18081"') do set "PID=%%p"
if defined PID (
    echo [start] Server already running on port 18081. Opening browser...
    start "" "http://localhost:18081"
    exit /b 0
)

echo [start] Starting Steel Vanguard on port 18081...
start "Steel Vanguard Server" /min cmd /c "node server.mjs"

rem Wait until the port is reachable (max ~10 s).
set /a TRIES=0
:wait
set /a TRIES+=1
if %TRIES% gtr 10 (
    echo [start] Server failed to start. Is Node.js installed and on PATH?
    exit /b 1
)
netstat -ano | findstr "LISTENING" | findstr ":18081" >nul
if errorlevel 1 (
    timeout /t 1 /nobreak >nul
    goto wait
)

echo [start] Server is up. Opening browser...
start "" "http://localhost:18081"
exit /b 0
