/**
 * Empêche migrate/seed d'altérer une base distante (ex. PC B).
 * Pour forcer explicitement : ALLOW_DB_MIGRATE=true
 */
export function assertLocalDbWritable(connectionHint: {
  databaseUrl?: string;
  host?: string;
}): void {
  if (process.env.ALLOW_DB_MIGRATE === 'true') {
    return;
  }

  const url = connectionHint.databaseUrl ?? '';
  const host = (connectionHint.host ?? '').toLowerCase();

  let urlHost = '';
  try {
    if (url) urlHost = new URL(url).hostname.toLowerCase();
  } catch {
    // ignore
  }

  const effectiveHost = urlHost || host || 'localhost';
  const isLocal =
    effectiveHost === 'localhost' ||
    effectiveHost === '127.0.0.1' ||
    effectiveHost === '::1' ||
    effectiveHost === 'db'; // docker compose service name

  if (!isLocal) {
    console.error(
      `\nRefus : migrate/seed ne doivent pas modifier la base distante (${effectiveHost}).\n` +
        `Le projet est branché en lecture/usage sur cette base sans y injecter le schéma/données du repo.\n` +
        `Pour forcer (déconseillé) : ALLOW_DB_MIGRATE=true\n`,
    );
    process.exit(1);
  }
}
