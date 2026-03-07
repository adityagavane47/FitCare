@echo off
title FitCare Local Ecosystem Setup

echo ========================================================
echo        FitCare AI Local Ecosystem Launcher
echo ========================================================
echo.

echo [INFO] Step 1/2: Booting up local Ollama (Phi-3) in background...
:: 'start cmd /k' opens a new terminal window to run Ollama and keeps it open
start cmd /k "title Ollama Backend && echo Starting Ollama Phi-3... && ollama run phi3"

:: Wait a brief moment to avoid rapid screen flashes
timeout /t 2 /nobreak > nul

echo.
echo [INFO] Step 2/2: Launching FastAPI Python Backend...
cd backend
echo.
echo ========================================================
echo Server will be available at: http://localhost:8000
echo JSON Docs available at:      http://localhost:8000/docs
echo ========================================================
echo.
python -m uvicorn main:app --reload

pause
