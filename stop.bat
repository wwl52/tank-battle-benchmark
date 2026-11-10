@echo off
rem STEEL VANGUARD quick stop - kills the server listening on port 18081
set FOUND=0
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":18081"') do (
    taskkill /PID %%p /F >nul 2>&1
    set FOUND=1
)
if "%FOUND%"=="1" (
    echo [stop] Server stopped.
) else (
    echo [stop] Server is not running.
)
exit /b 0
