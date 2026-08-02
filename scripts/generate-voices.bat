@echo off
REM ===========================================================================
REM  Portfolio tour - one-shot voice generation for Windows.
REM
REM  Double-click this file, or run it from the project folder:
REM      scripts\generate-voices.bat
REM
REM  It checks your setup, installs dependencies, auditions the voices, then
REM  generates the full tour and pushes the result. Nothing to memorise and no
REM  environment-variable syntax to get wrong.
REM ===========================================================================

setlocal
cd /d "%~dp0\.."

echo.
echo  ============================================================
echo   Portfolio tour  -  voice generation
echo  ============================================================
echo.

REM --- Node present? -------------------------------------------------------
where node >nul 2>&1
if errorlevel 1 goto no_node
for /f "delims=" %%v in ('node --version') do set "NODEVER=%%v"
echo  [ok]  Node %NODEVER%

REM --- Right folder? -------------------------------------------------------
if not exist "package.json" goto wrong_folder
echo  [ok]  Project folder: %CD%

REM --- Dependencies --------------------------------------------------------
if exist "node_modules" goto deps_ready
echo  [..]  Installing dependencies. This takes a minute.
call npm install --no-audit --no-fund
if errorlevel 1 goto npm_failed
:deps_ready
echo  [ok]  Dependencies ready

REM --- API key -------------------------------------------------------------
if not "%OPENAI_API_KEY%"=="" goto have_key
echo.
echo  Paste your OpenAI API key and press Enter.
echo  ^(It is used only for this run and is never written to disk.^)
echo.
set /p "OPENAI_API_KEY=  Key: "
:have_key
if "%OPENAI_API_KEY%"=="" goto no_key
echo  [ok]  API key set for this run

REM --- Step 1: audition voices --------------------------------------------
echo.
echo  ------------------------------------------------------------
echo   Step 1 of 2  -  generating four voice samples
echo  ------------------------------------------------------------
echo.
call npm run voices:sample
if errorlevel 1 goto gen_failed

echo.
echo  Opening the folder so you can listen to the samples.
start "" "public\tour\audio"

echo.
echo  Play the four _sample-*.mp3 files, then type the voice you want.
echo    alloy    onyx    nova    shimmer
echo.
set /p "TOUR_VOICE=  Voice [onyx]: "
if "%TOUR_VOICE%"=="" set "TOUR_VOICE=onyx"

REM --- Step 2: full tour ---------------------------------------------------
echo.
echo  ------------------------------------------------------------
echo   Step 2 of 2  -  generating the full tour in "%TOUR_VOICE%"
echo  ------------------------------------------------------------
echo.
call npm run voices
if errorlevel 1 goto gen_failed

REM --- Publish -------------------------------------------------------------
echo.
echo  [..]  Committing and pushing the audio.
git add public/tour
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "Add generated tour audio and manifest"
  git push origin main
) else (
  echo  [ok]  Nothing new to commit - audio already up to date.
)

echo.
echo  ============================================================
echo   Done. The audio and manifest are in public\tour\
echo   Tell Claude it is pushed and it will build the player.
echo  ============================================================
echo.
pause
exit /b 0

REM --- Failure paths -------------------------------------------------------
:no_node
echo  [X]  Node.js is not installed, or not on your PATH.
echo       Install Node 20 or newer from https://nodejs.org
echo       then close this window and run the script again.
goto fail

:wrong_folder
echo  [X]  package.json not found in %CD%
echo       Keep this script inside the project's scripts\ folder.
goto fail

:npm_failed
echo  [X]  npm install failed. Scroll up for the reason.
goto fail

:no_key
echo  [X]  No API key entered, so there is nothing to generate with.
goto fail

:gen_failed
echo  [X]  Generation failed. The error above says why.
echo       A 401 means the key is wrong or revoked.
echo       A 429 means the account is out of quota.
goto fail

:fail
echo.
pause
exit /b 1
