@echo off
echo Cerrando instancias anteriores...

:: Cerrar ventanas CMD previas del mismo proyecto
taskkill /fi "WINDOWTITLE eq Pixel Agents - Server" /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq Pixel Agents - UI" /f >nul 2>&1

:: Liberar puertos 3000 y 5173 por si quedaron procesos huerfanos
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000 "') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":5173 "') do taskkill /f /pid %%a >nul 2>&1

timeout /t 1 /nobreak >nul

echo Iniciando Pixel Agents Standalone...

start "Pixel Agents - Server" cmd /k "cd /d %~dp0 && npm run standalone:dev"
timeout /t 3 /nobreak >nul
start "Pixel Agents - UI" cmd /k "cd /d %~dp0\webview-ui && npm run dev"
timeout /t 4 /nobreak >nul
start "" "http://localhost:5173"
