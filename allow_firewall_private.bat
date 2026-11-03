@echo off
setlocal
rem Allow inbound TCP 3000 on PRIVATE networks only (trusted hotspot / home Wi-Fi). Run as Administrator.
net session >nul 2>nul
if errorlevel 1 (
    echo ERROR: Right-click this file and choose "Run as administrator".
    pause
    exit /b 1
)
set "PORT=3000"
netsh advfirewall firewall delete rule name="Tank LAN %PORT%" >nul 2>nul
netsh advfirewall firewall add rule name="Tank LAN %PORT%" dir=in action=allow protocol=TCP localport=%PORT% profile=private
echo.
echo Done. If your hotspot network is classed as Public in Windows, set it to Private
echo (Settings ^> Network ^& internet ^> Wi-Fi ^> your network ^> Network profile type).
pause
