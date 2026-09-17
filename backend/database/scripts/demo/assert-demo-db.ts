/**
 * Garde de sécurité unique pour tous les scripts de démonstration.
 *
 * Règle absolue : les scripts démo ne doivent jamais écrire, migrer, dumper ou
 * restaurer une base qui ne se termine pas exactement par `_demo`.
 * Les scripts doivent appeler ce helper AVANT toute connexion SQL.
 */

export const DEMO_DB_SUFFIX = '_demo';
export const FORBIDDEN_DB_NAME = 'mada_risk';

export const DEMO_DB_ALLOWED_MESSAGE_PREFIX = 'Base de démonstration autorisée :';
export const DEMO_DB_SECURITY_MESSAGE =
  'ERREUR DE SÉCURITÉ : les scripts démo refusent toute base non démo.';

export interface DemoDbInput {
  databaseUrl?: string | undefined;
  dbName?: string | undefined;
}

export class DemoDatabaseSecurityError extends Error {
  constructor(message: string = DEMO_DB_SECURITY_MESSAGE) {
    super(message);
    this.name = 'DemoDatabaseSecurityError';
  }
}

/** Extrait uniquement le nom de la base cible (jamais les identifiants). */
export function resolveDatabaseName(input: DemoDbInput): string {
  const url = input.databaseUrl?.trim();
  if (url) {
    try {
      const name = new URL(url).pathname.replace(/^\//, '');
      if (name) return name;
    } catch {
      // URL illisible : on retombe sur le nom explicite.
    }
  }
  return (input.dbName ?? '').trim();
}

export function isAllowedDemoDatabase(name: string): boolean {
  return name.length > 0 && name !== FORBIDDEN_DB_NAME && name.endsWith(DEMO_DB_SUFFIX);
}

/**
 * Vérifie la base cible et retourne son nom. Lève une DemoDatabaseSecurityError
 * si la base n'est pas explicitement une base de démonstration.
 */
export function assertDemoDatabase(input: DemoDbInput = {}): string {
  const name = resolveDatabaseName(input);

  if (!isAllowedDemoDatabase(name)) {
    throw new DemoDatabaseSecurityError();
  }

  console.log(`${DEMO_DB_ALLOWED_MESSAGE_PREFIX} ${name}`);
  return name;
}

/** Variante CLI : affiche une erreur claire et stoppe le script. */
export function assertDemoDatabaseOrExit(input: DemoDbInput = {}): string {
  try {
    return assertDemoDatabase(input);
  } catch (err) {
    console.error('');
    console.error(DEMO_DB_SECURITY_MESSAGE);
    if (err instanceof Error && err.message !== DEMO_DB_SECURITY_MESSAGE) {
      console.error(err.message);
    }
    console.error(
      "Aucune requête SQL n'a été exécutée. Utilisez uniquement une base dont le nom se termine par '_demo'.",
    );
    process.exit(1);
  }
}
