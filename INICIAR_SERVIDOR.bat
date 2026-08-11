@echo off
title Gardenias Server
chcp 65001 > nul

echo Liberando puerto 8080 si estuviera ocupado...
for /f "tokens=5" %%A in ('netstat -a -n -o ^| findstr /R /C:":8080 .*LISTENING"') do (
    taskkill /F /PID %%A >nul 2>&1
)

echo.
echo Iniciando servidor de Gardenias...
python server.py
pause
