@echo off
setlocal
title Mellow safe C drive cleanup
echo Mellow safe C drive cleanup
echo First you will see a preview. Cleanup is a separate, confirmed step.
echo Only old temp files, named Mellow caches, and Chrome's component download cache are eligible.
echo Chrome profiles, cookies, sign-ins, history, projects, downloads, and releases are protected.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dpn0.ps1" -PreviewOnly
if errorlevel 1 goto done
echo.
choice /C YN /N /M "Run the cleanup now? [Y/N] "
if errorlevel 2 goto done
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dpn0.ps1"
:done
echo.
pause
endlocal
