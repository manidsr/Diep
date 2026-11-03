@echo off
setlocal EnableExtensions

rem Apply one AI-generated unified Git patch safely from the repository root.
rem Save the .patch file OUTSIDE the repository (for example, Downloads).

cd /d "%~dp0"

if "%~1"=="" (
    echo Usage: apply_patch.bat "C:\path\to\change.patch"
    echo.
    set /p PATCH_FILE=Enter the full path to the .patch file: 
) else (
    set "PATCH_FILE=%~1"
)

if not exist "%PATCH_FILE%" (
    echo ERROR: Patch file not found: "%PATCH_FILE%"
    exit /b 1
)

where git >nul 2>nul
if errorlevel 1 (
    echo ERROR: Git was not found. Install Git for Windows and try again.
    exit /b 1
)

git rev-parse --show-toplevel >nul 2>nul
if errorlevel 1 (
    echo ERROR: This script must be placed in the root of a Git repository.
    exit /b 1
)

for /f "delims=" %%H in ('git rev-parse --short HEAD') do set "BASE_COMMIT=%%H"

rem Require a clean checkout so the patch cannot overwrite unrelated local work.
set "STATUS_FILE=%TEMP%\ai_patch_status_%RANDOM%_%RANDOM%.txt"
git status --porcelain --untracked-files=all > "%STATUS_FILE%"
for %%Z in ("%STATUS_FILE%") do set "STATUS_SIZE=%%~zZ"
if not "%STATUS_SIZE%"=="0" (
    echo ERROR: Your working tree is not clean. No changes were applied.
    echo Commit or stash your work first, then run this script again.
    echo.
    git status --short
    del "%STATUS_FILE%" >nul 2>nul
    exit /b 1
)
del "%STATUS_FILE%" >nul 2>nul

rem Keep a named branch pointing to the exact pre-patch commit for easy recovery.
set "BACKUP_BRANCH=backup/ai-patch-%BASE_COMMIT%-%RANDOM%"
git branch "%BACKUP_BRANCH%" HEAD
if errorlevel 1 (
    echo ERROR: Could not create the backup branch. No changes were applied.
    exit /b 1
)

echo.
echo Checking patch against commit %BASE_COMMIT% ...
git apply --check "%PATCH_FILE%"
if errorlevel 1 (
    echo.
    echo ERROR: Patch does not apply cleanly. No changes were applied.
    echo Your local checkout may differ from the repository version used by the AI.
    echo Backup branch retained: %BACKUP_BRANCH%
    exit /b 1
)

echo Applying patch ...
git apply "%PATCH_FILE%"
if errorlevel 1 (
    echo.
    echo ERROR: Git reported a problem while applying the patch.
    echo Inspect "git status" before doing anything else.
    echo Pre-patch backup branch: %BACKUP_BRANCH%
    exit /b 1
)

echo.
echo SUCCESS: Patch applied.
echo Base commit: %BASE_COMMIT%
echo Recovery branch: %BACKUP_BRANCH%
echo.
echo Review the changes with: git diff --stat ^&^& git diff
 echo Then run the test commands supplied with the patch.
echo To discard this patch before committing anything else:
echo   git reset --hard %BACKUP_BRANCH%
echo.
exit /b 0
