@echo off
title نظام المحاسبة - السيرفر
echo.
echo ====================================
echo   نظام المحاسبة وإدارة المخازن
echo ====================================
echo.
start "" "dist\AccountingServer.exe" 8000
echo جاري تشغيل السيرفر...
timeout /t 3 /nobreak >nul
start http://localhost:8000
echo.
echo فتح المتصفح على http://localhost:8000
echo.
pause
