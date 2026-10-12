#!/usr/bin/env node
/**
 * Garde-fou anti-`EADDRINUSE` pour le démarrage de l'API (`npm run dev`).
 *
 * `tsx watch` relance le serveur à chaque sauvegarde ; l'ancienne instance met
 * plusieurs secondes à libérer le port 5000 (fermeture du pool PostgreSQL). Si la
 * nouvelle démarre avant, Node lève `EADDRINUSE :::5000`. Sur Windows, l'arrêt
 * n'est pas toujours complet et laisse des watchers orphelins.
 *
 * Exécuté en `predev`, ce script nettoie ces résidus AVANT le vrai démarrage :
 *   1. tout processus qui écoute déjà sur PORT ;
 *   2. tout `tsx watch` résiduel de ce projet (qui reprendrait le port ensuite).
 *
 * Usage manuel : `npm run free-port`.
 */
import { execFileSync } from 'node:child_process';

const PORT = Number(process.env.PORT ?? 5000);
const isWindows = process.platform === 'win32';

// Motifs identifiant les watchers tsx de ce projet.
const WATCHER_MARKERS = ['src/server.ts'];

function run(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    // Commande absente ou aucun résultat (code de sortie non nul) : on ignore.
    return '';
  }
}

function toPids(raw) {
  return raw
    .split(/\s+/)
    .map((value) => Number.parseInt(value, 10))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

function listenersOnPort() {
  if (isWindows) {
    return toPids(
      run('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Get-NetTCPConnection -State Listen -LocalPort ${PORT} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess`,
      ]),
    );
  }
  return toPids(run('lsof', ['-nP', `-iTCP:${PORT}`, '-sTCP:LISTEN', '-t']));
}

function leftoverWatchers() {
  if (isWindows) {
    const matches = WATCHER_MARKERS.map((marker) => `$_.CommandLine -match '${marker}'`).join(
      ' -or ',
    );
    return toPids(
      run('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'tsx' -and (${matches}) } | Select-Object -ExpandProperty ProcessId`,
      ]),
    );
  }

  const found = new Set();
  for (const marker of WATCHER_MARKERS) {
    toPids(run('pgrep', ['-f', `watch ${marker}`])).forEach((pid) => found.add(pid));
  }
  return [...found];
}

function kill(pid) {
  if (isWindows) {
    // /T : emporte aussi les enfants (le serveur lancé par le watcher).
    execFileSync('taskkill', ['/PID', String(pid), '/F', '/T'], { stdio: 'ignore' });
  } else {
    process.kill(pid, 'SIGKILL');
  }
}

const targets = new Set([...listenersOnPort(), ...leftoverWatchers()]);
for (const self of [process.pid, process.ppid]) {
  targets.delete(self);
}

if (targets.size === 0) {
  console.log(`[free-port] Port ${PORT} disponible, aucun watcher résiduel.`);
  process.exit(0);
}

for (const pid of targets) {
  try {
    kill(pid);
    console.log(`[free-port] Processus résiduel ${pid} arrêté.`);
  } catch (error) {
    console.warn(`[free-port] Impossible d'arrêter le processus ${pid} : ${error.message}`);
  }
}

// Laisse au système le temps de relâcher le port avant le vrai démarrage.
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
console.log(`[free-port] Port ${PORT} libéré.`);
