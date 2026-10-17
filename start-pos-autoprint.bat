@echo off
chcp 65001 >nul
title POS Stock - Auto Print Mode

rem เปิดหน้าร้านในโหมดที่สั่งพิมพ์เองได้โดยไม่ต้องกดยืนยัน (--kiosk-printing)
rem ยิงบาร์โค้ดที่โต๊ะ -> ใบเช็คบิลออกจากเครื่องพิมพ์เลย ไม่มีหน้าต่างให้กด Print
rem
rem ต้องใช้โปรไฟล์แยก (--user-data-dir) ไม่งั้นถ้า Chrome เปิดค้างอยู่แล้ว
rem Windows จะแค่เปิดแท็บใหม่ในหน้าต่างเดิม แล้วโหมดพิมพ์อัตโนมัติจะไม่ทำงาน
rem
rem พิมพ์ออกเครื่องพิมพ์เริ่มต้นของ Windows เสมอ -> ต้องตั้ง POSPrinter POS-80 เป็นค่าเริ่มต้นไว้
rem
rem ใช้ครั้งแรก:  start-pos-autoprint.bat setup   (เปิดแบบมีหน้าต่างพิมพ์ ให้ปิด Headers and footers)
rem ใช้งานจริง:   start-pos-autoprint.bat         (พิมพ์เงียบ ไม่ถาม)

set CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" (
  echo Chrome not found. Install Google Chrome first.
  pause
  exit /b 1
)

set PROFILE=%LOCALAPPDATA%\pos-stock-chrome

if /i "%~1"=="setup" goto setup

start "" "%CHROME%" --kiosk-printing --user-data-dir="%PROFILE%" http://localhost:5173
echo.
echo Auto-print mode opened.
echo Scan a table barcode -^> the bill slip prints straight to POSPrinter POS-80.
echo.
echo Headers/footers are already turned off for this profile.
echo If they come back, close Chrome and run:  start-pos-autoprint.bat setup
echo.
timeout /t 6 /nobreak >nul
exit /b 0

:setup
start "" "%CHROME%" --user-data-dir="%PROFILE%" http://localhost:5173
echo.
echo SETUP MODE (print dialog is shown on purpose).
echo.
echo   1. Open a table, print one bill slip
echo   2. In the print dialog: More settings
echo   3. Turn OFF "Headers and footers", set Margins to None
echo   4. Print once so Chrome remembers it
echo   5. Close Chrome, then run start-pos-autoprint.bat normally
echo.
pause
