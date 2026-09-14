@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: ----------------------------------------------
::  Cascabel Launcher - Windows Build Script
::  Builds the portable .exe and places it
::  in the output\ folder.
:: ----------------------------------------------

cd /d "%~dp0"

set "OUTPUT_DIR=%~dp0output"
set "DIST_DIR=%~dp0dist"

:: Ensure no trailing backslash to prevent \" quote escaping issues in cmd
if "%OUTPUT_DIR:~-1%"=="\" set "OUTPUT_DIR=%OUTPUT_DIR:~0,-1%"
if "%DIST_DIR:~-1%"=="\" set "DIST_DIR=%DIST_DIR:~0,-1%"

echo.
echo =============================================
echo   Cascabel Launcher - Windows Build
echo =============================================
echo.

:: -- Close running instances to release file locks --
taskkill /F /IM "Cascabel*.exe" >nul 2>&1
timeout /t 1 /nobreak >nul 2>&1

:: -- Check Node.js --------------------------
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed. Please install it from https://nodejs.org
    goto :end_pause
)

where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm is not installed. Please install Node.js from https://nodejs.org
    goto :end_pause
)

echo [OK] Node.js found: 
call node --version

:: -- Check dependencies ---------------------
set "needs_install=false"
if not exist "node_modules\" set "needs_install=true"

if "!needs_install!"=="true" (
    echo.
    echo [INFO] Dependencies not found. Installing...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        goto :end_pause
    )
    echo [OK] Dependencies installed successfully.
) else (
    echo [OK] Dependencies found.
)

:: -- Clean previous builds ------------------
echo.
echo [INFO] Cleaning previous build...
if exist "%OUTPUT_DIR%" rmdir /s /q "%OUTPUT_DIR%" >nul 2>&1
if exist "%DIST_DIR%" rmdir /s /q "%DIST_DIR%" >nul 2>&1
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

:: -- Build ----------------------------------
echo.
echo [INFO] Building Windows executable...
echo.
call npx electron-builder --win --config.directories.output=dist
if errorlevel 1 (
    echo.
    echo [ERROR] Build failed. Check the output above for details.
    goto :end_pause
)

:: -- Copy .exe to output --------------------
echo.
echo [INFO] Copying executable to output folder...

if not exist "%DIST_DIR%" (
    echo [ERROR] dist\ directory not found. Build may have failed.
    goto :end_pause
)

if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

:: Copy using PowerShell (handles paths and spaces cleanly)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Copy-Item -Path '%DIST_DIR%\*.exe' -Destination '%OUTPUT_DIR%' -Force" >nul 2>&1

:: Fallback copy if needed
if not exist "%OUTPUT_DIR%\*.exe" (
    copy /y "%DIST_DIR%\*.exe" "%OUTPUT_DIR%" >nul 2>&1
)

:: -- Verify copy success --------------------
set "found=0"
set "EXE_NAME="
set "EXE_SIZE="
for %%f in ("%OUTPUT_DIR%\*.exe") do (
    set "found=1"
    set "EXE_NAME=%%~nxf"
    set "EXE_SIZE=%%~zf"
)

if "!found!"=="0" (
    echo.
    echo =======================================================
    echo   [ERROR] BUILD FAILED: Executable not found in output\
    echo =======================================================
    echo The executable could not be copied to:
    echo   %OUTPUT_DIR%
    echo.
    echo Please make sure Cascabel is not currently running or
    echo locked by an antivirus program.
    echo =======================================================
    goto :end_pause
)

:: -- Done -----------------------------------
echo.
echo =======================================================
echo   BUILD COMPLETED SUCCESSFULLY!
echo =======================================================
echo.
echo [OK] The build has finished successfully.
echo [OK] Your Windows portable executable is ready in the output\ folder:
echo.
echo File:        !EXE_NAME!
echo Size:        !EXE_SIZE! bytes
echo Folder:      %OUTPUT_DIR%
echo Full Path:   %OUTPUT_DIR%\!EXE_NAME!
echo.
echo Files in output:
dir /b "%OUTPUT_DIR%"
echo.
echo =======================================================

:end_pause
echo.
pause
exit /b 0

