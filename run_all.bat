@echo off
title Tan-aw AI Launcher
setlocal EnableDelayedExpansion

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%frontend"
set "SAMPLE=0"

if /I "%~1"=="-sample" set "SAMPLE=1"

echo.
echo ==============================================
echo   Tan-aw AI - Starting up
if "%SAMPLE%"=="1" (
    echo   Mode: TEST ^(sample centers ON^)
) else (
    echo   Mode: RESIDENT ^(sample centers OFF^)
)
echo ==============================================
echo.

if not exist "%BACKEND%\main.py" (
    echo [ERROR] backend\main.py not found.
    echo Save this file in the Mobile_apk folder, next to backend and frontend.
    pause
    exit /b 1
)

if not exist "%FRONTEND%\index.html" (
    echo [ERROR] frontend\index.html not found.
    pause
    exit /b 1
)

if not exist "%BACKEND%\venv\Scripts\activate.bat" (
    echo [ERROR] Virtual environment not found in backend\venv
    echo Create it first:
    echo   cd backend
    echo   python -m venv venv
    echo   .\venv\Scripts\activate
    echo   pip install -r requirements.txt
    pause
    exit /b 1
)

echo [1/4] Stopping old servers on ports 8000 and 5500...
for %%P in (8000 5500) do (
    for /f "tokens=5" %%A in ('netstat -ano ^| findstr ":%%P " ^| findstr LISTENING') do (
        taskkill /PID %%A /F >nul 2>&1
    )
)

echo [2/4] Starting backend on http://127.0.0.1:8000
start "Tan-aw Backend" cmd /k "cd /d "%BACKEND%" && set TANAW_SAMPLE=%SAMPLE% && call venv\Scripts\activate.bat && uvicorn main:app --reload --host 127.0.0.1 --port 8000"

echo [3/4] Starting frontend on http://127.0.0.1:5500
start "Tan-aw Frontend" cmd /k "cd /d "%FRONTEND%" && python -m http.server 5500 --bind 127.0.0.1"

echo [4/4] Waiting for the backend to answer...
set "READY=0"
for /L %%i in (1,1,30) do (
    if "!READY!"=="0" (
        powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/ -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
        if !errorlevel! equ 0 set "READY=1"
        if "!READY!"=="0" timeout /t 1 /nobreak >nul
    )
)

if "!READY!"=="1" (
    echo Backend is ready.
) else (
    echo [WARNING] The backend did not answer yet. Check the Tan-aw Backend window for errors.
)

echo Opening the chat in your browser...
start "" "http://127.0.0.1:5500/login.html"