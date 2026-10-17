@echo off
chcp 65001 >nul
cd /d "%~dp0"
title POS Stock - Start All

echo [1/5] Checking Docker...
docker info >nul 2>&1
if not errorlevel 1 goto dockerok
echo Docker is not running. Starting Docker Desktop...
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
:waitdocker
timeout /t 5 /nobreak >nul
docker info >nul 2>&1
if errorlevel 1 goto waitdocker
:dockerok

echo [2/5] Starting PostgreSQL + pgAdmin...
docker compose up -d
if errorlevel 1 ( echo docker compose failed & pause & exit /b 1 )
:waitdb
docker exec pos_stock_db pg_isready -U pos_admin -d pos_stock >nul 2>&1
if errorlevel 1 ( timeout /t 2 /nobreak >nul & goto waitdb )

echo [3/5] Backend: install + migrate...
cd backend
if not exist node_modules call npm install
call npm run db:migrate
cd ..

echo [4/5] Frontend: install...
cd frontend
if not exist node_modules call npm install
cd ..

echo [5/6] Starting backend (4000) and frontend (5173)...
start "POS Backend :4000" cmd /k "cd /d "%~dp0backend" && npm run dev"
start "POS Frontend :5173" cmd /k "cd /d "%~dp0frontend" && npm run dev"
timeout /t 6 /nobreak >nul

echo [6/6] Cloudflare Tunnel (customers outside shop WiFi)...
start "POS Tunnel" cmd /k "cd /d "%~dp0backend" && npm run tunnel"
timeout /t 10 /nobreak >nul

start "" http://localhost:5173

echo.
echo Ready:  Web http://localhost:5173   API http://localhost:4000/api/health   pgAdmin http://localhost:5050
echo Login:  owner / owner123
echo.
echo The tunnel window shows the public link. It changes every restart,
echo so reopen the table QR after starting - old printed QR slips stop working.
echo Close the three server windows to stop. Database keeps running in Docker.
pause
