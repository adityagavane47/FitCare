@echo off
title FitCare AI Form Correction Ecosystem

echo ========================================================
echo        FitCare Full-Stack Local AI Launcher
echo ========================================================
echo.

echo [INFO] Step 1/2: Booting up local Ollama (Phi-3) in background...
:: Open a new terminal specifically for Ollama
start cmd /k "title Ollama Local Server && echo Starting Ollama Phi-3 Inference Engine... && ollama run phi3"

:: Wait 2 seconds
timeout /t 2 /nobreak > nul

echo.
echo [INFO] Step 2/2: Launching FastAPI Python Backend...
cd backend
echo.
echo ========================================================
echo Backend Server Booting on: http://localhost:8000
echo Endpoints include POST /api/workout/analysis
echo ========================================================
echo.
python -m uvicorn main:app --reload

pause
