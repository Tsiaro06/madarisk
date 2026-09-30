@echo off
REM ---------------------------------------------------------------------------
REM Lanceur de production utilise par la tache planifiee Windows.
REM
REM NODE_ENV=production est defini ici, et non dans .env, pour deux raisons :
REM   1. dotenv n'ecrase pas une variable deja presente dans l'environnement,
REM      donc ce choix prime sur le NODE_ENV=development du .env ;
REM   2. .env reste utilise tel quel par `npm run dev`, qui a besoin du mode
REM      developpement (rate limit elargi, pas de service du SPA).
REM
REM Resultat : un seul processus Node sert l'API ET le frontend compile, et
REM les jobs de synchronisation meteo continuent de tourner meme lorsque
REM `npm run dev` est arrete.
REM ---------------------------------------------------------------------------
setlocal
set NODE_ENV=production

set "BACKEND_DIR=%~dp0..\backend"
if not exist "%BACKEND_DIR%\logs" mkdir "%BACKEND_DIR%\logs"

cd /d "%BACKEND_DIR%"
"C:\Program Files\nodejs\node.exe" dist\server.js >> "%BACKEND_DIR%\logs\service.log" 2>&1