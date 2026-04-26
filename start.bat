@echo off
echo Iniciando Pixel Agents Standalone...

start "Pixel Agents - Server" cmd /k "cd /d %~dp0 && npm run standalone:dev"
timeout /t 3 /nobreak >nul
start "Pixel Agents - UI" cmd /k "cd /d %~dp0\webview-ui && npm run dev"
timeout /t 4 /nobreak >nul
start "" "http://localhost:5173"
