@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM =============================================
REM Learning-Tracker-TG - AUTO GIT PUSH SCRIPT
REM Tu dong commit va push code len GitHub
REM =============================================

echo.
echo ==============================================================
echo     Learning-Tracker-TG - AUTO GIT PUSH
echo     Tu dong luu code len GitHub
echo ==============================================================
echo.

REM Khoi tao git va remote neu chua co
if not exist ".git\" (
    echo [INFO] Khoi tao Git repository...
    git init
    git branch -M main
    git remote add origin git@github.com:ngTwg/Learning-Tracker-TG.git
    echo [INFO] Da khoi tao va ket noi voi GitHub.
    echo.
)

REM Kiem tra xem co thay doi khong
git status --porcelain > temp_status.txt
set /p STATUS=<temp_status.txt
del temp_status.txt

if "!STATUS!"=="" (
    echo [INFO] Khong co thay doi nao de commit.
    echo.
    pause
    exit /b 0
)

REM Hien thi cac file thay doi
echo [FILES] Cac file da thay doi:
echo --------------------------------------------------------------
git status --short
echo.

REM Hoi commit message
set /p COMMIT_MSG="[INPUT] Nhap noi dung commit (Enter de dung mac dinh): "

REM Neu khong nhap, dung message mac dinh voi timestamp
if "!COMMIT_MSG!"=="" (
    for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set DATE=%%c-%%b-%%a
    for /f "tokens=1-2 delims=: " %%a in ('time /t') do set TIME=%%a:%%b
    set COMMIT_MSG=Auto save: !DATE! !TIME!
)

echo.
echo [COMMIT] Message: !COMMIT_MSG!
echo.

REM Add tat ca cac file
echo [1/3] Adding files...
git add -A
if !errorlevel! neq 0 (
    echo [ERROR] Loi khi add files!
    pause
    exit /b 1
)
echo      OK - Done

REM Commit
echo [2/3] Committing...
git commit -m "!COMMIT_MSG!"
if !errorlevel! neq 0 (
    echo [ERROR] Loi khi commit!
    pause
    exit /b 1
)
echo      OK - Done

REM Push
echo [3/3] Pushing to GitHub...
git push -u origin main
if !errorlevel! neq 0 (
    echo.
    echo [WARN] Push that bai. Thu push voi force...
    git push -u origin main --force
    if !errorlevel! neq 0 (
        echo [ERROR] Khong the push! Kiem tra lai ket noi hoac quyen truy cap.
        pause
        exit /b 1
    )
)
echo      OK - Done

echo.
echo ==============================================================
echo     PUSH THANH CONG!
echo ==============================================================
echo.
echo [INFO] Code da duoc luu len GitHub.
echo.

REM Hien thi commit moi nhat
echo [LAST COMMIT]:
git log -1 --oneline
echo.

pause
