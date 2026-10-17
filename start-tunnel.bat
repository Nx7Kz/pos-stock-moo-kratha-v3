@echo off
chcp 65001 >nul
cd /d "%~dp0backend"
title POS Stock - Cloudflare Tunnel

echo Opening the shop website to the internet (Cloudflare Tunnel)...
echo The link is saved as the QR address automatically.
echo Keep this window open while customers are scanning.
echo.

call npm run tunnel

echo.
echo Tunnel closed. Customers outside the shop WiFi can no longer scan.
pause
