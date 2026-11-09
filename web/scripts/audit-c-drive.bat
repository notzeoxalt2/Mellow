@echo off
setlocal
title C drive read-only space audit
echo Read-only C: space audit
echo This reports the largest immediate subfolders. It does not change any files.
echo The scan can take a few minutes on a busy drive.
echo.
set "AUDIT_PATH=C:\"
if not "%~1"=="" set "AUDIT_PATH=%~1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dpn0.ps1" -FolderPath "%AUDIT_PATH%" -Top 30
echo.
pause
endlocal
