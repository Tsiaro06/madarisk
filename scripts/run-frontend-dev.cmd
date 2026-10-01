@echo off
REM ---------------------------------------------------------------------------
REM Lanceur du serveur de developpement Vite (port 5173), utilise par la tache
REM planifiee Windows "MadaRisk Frontend".
REM
REM Meme demarche que run-production.cmd : on appelle le binaire Node avec un
REM chemin absolu plutot que `npm run dev`, afin que le demarrage ne depende ni
REM du PATH de l'utilisateur qui ouvre la session, ni d'un shell installe.
REM
REM `--strictPort` est volontaire : sans lui, Vite bascule silencieusement sur
REM 5174 quand 5173 est deja occupe. La tache resterait "verte" alors que le
REM navigateur sur 5173 ne trouve rien. Ici le processus sort, et la tache
REM redemarre (RestartCount 999 / 1 min) jusqu'a ce que le port soit libre.
REM ---------------------------------------------------------------------------
setlocal

set "FRONTEND_DIR=%~dp0..\frontend"
if not exist "%FRONTEND_DIR%\logs" mkdir "%FRONTEND_DIR%\logs"

cd /d "%FRONTEND_DIR%"
"C:\Program Files\nodejs\node.exe" node_modules\vite\bin\vite.js --port 5173 --strictPort >> "%FRONTEND_DIR%\logs\dev.log" 2>&1
