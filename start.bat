@echo off
setlocal
title Aegis launcher
cd /d "%~dp0"

echo.
echo  Aegis - AI incident response for PayFlow
echo  ----------------------------------------

where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js 20+ is required: https://nodejs.org
  pause
  exit /b 1
)

rem --- env files ------------------------------------------------------------
if not exist "server\.env" copy "server\.env.example" "server\.env" >nul
if not exist "client\.env" copy "client\.env.example" "client\.env" >nul

rem --- dependencies ---------------------------------------------------------
if exist "server\node_modules" goto client_deps
echo  Installing server packages...
pushd server
call npm install --no-audit --no-fund
popd
:client_deps
if exist "client\node_modules" goto mongo
echo  Installing client packages...
pushd client
call npm install --no-audit --no-fund
popd

rem --- local MongoDB on port 27018, data kept in .mongo-data ----------------
:mongo
netstat -ano | findstr ":27018" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo  MongoDB already running on port 27018.
  goto apps
)
set "MONGOD="
for /d %%V in ("C:\Program Files\MongoDB\Server\*") do if exist "%%~V\bin\mongod.exe" set "MONGOD=%%~V\bin\mongod.exe"
if not defined MONGOD goto no_mongo
if not exist ".mongo-data" mkdir ".mongo-data"
echo  Starting MongoDB on port 27018...
start "Aegis MongoDB" /min "%MONGOD%" --dbpath "%~dp0.mongo-data" --port 27018 --bind_ip 127.0.0.1 --quiet
ping -n 4 127.0.0.1 >nul
goto apps

:no_mongo
echo  MongoDB server not found under C:\Program Files\MongoDB.
echo  Install MongoDB Community, or point MONGODB_URI in server\.env at an Atlas cluster.

rem --- API and UI -----------------------------------------------------------
:apps
echo  Starting API on http://localhost:4000 ...
start "Aegis API" cmd /k "cd /d "%~dp0server" && npm run dev"
echo  Starting UI on http://localhost:5173 ...
start "Aegis UI" cmd /k "cd /d "%~dp0client" && npm run dev"

ping -n 7 127.0.0.1 >nul
start "" http://localhost:5173
echo.
echo  Aegis is running. Close the "Aegis API", "Aegis UI" and "Aegis MongoDB" windows to stop it.
echo.
endlocal
