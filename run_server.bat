@echo off
title Accounting Server
echo.
echo ====================================
echo   Accounting & Warehouse System
echo ====================================
echo.
start "" "dist\AccountingServer.exe" 8000
echo Starting server...
timeout /t 3 /nobreak >nul
start http://localhost:8000
echo.
echo Open browser at http://localhost:8000
echo.
pause
