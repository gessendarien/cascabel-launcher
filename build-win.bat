@echo off
setlocal enabledelayedexpansion

:: ──────────────────────────────────────────────
::  Cascabel Launcher — Windows Build Script
::  Builds the portable .exe and places it
::  in the output\ folder.
:: ──────────────────────────────────────────────

cd /d "%~dp0"

set "OUTPUT_DIR=%~dp0output"
set "DIST_DIR=%~dp0dist"

echo.
echo =============================================
echo   Cascabel Launcher — Windows Build
echo =============================================
echo.

:: ── Check Node.js ──────────────────────────
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

:: ── Check dependencies ─────────────────────
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

:: ── Clean previous builds ──────────────────
echo.
echo [INFO] Cleaning previous build...
if exist "%OUTPUT_DIR%" rmdir /s /q "%OUTPUT_DIR%"
if exist "%DIST_DIR%" rmdir /s /q "%DIST_DIR%"
mkdir "%OUTPUT_DIR%"

:: ── Build ──────────────────────────────────
echo.
echo [INFO] Building Windows executable...
echo.
call npx electron-builder --win --config.directories.output=dist
if errorlevel 1 (
    echo.
    echo [ERROR] Build failed. Check the output above for details.
    goto :end_pause
)

:: ── Copy .exe to output ────────────────────
if not exist "%DIST_DIR%" (
    echo [ERROR] dist\ directory not found. Build may have failed.
    goto :end_pause
)

set "found=0"
for %%f in ("%DIST_DIR%\*.exe") do (
    copy /y "%%f" "%OUTPUT_DIR%\" >nul
    set "found=1"
)

if "!found!"=="0" (
    echo [ERROR] No .exe files found in dist\.
    goto :end_pause
)

:: ── Done ───────────────────────────────────
echo.
echo =======================================================
echo   BUILD COMPLETED SUCCESSFULLY!
echo =======================================================
echo.
echo [OK] The build has finished successfully.
echo [OK] Your Windows portable executable is located in the output\ folder:
echo.
echo File(s):
dir /b "%OUTPUT_DIR%"
echo.
echo Folder path:
echo %OUTPUT_DIR%
echo.
echo =======================================================

:end_pause
echo.
pause
exit /b 0
