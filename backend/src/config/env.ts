import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

/**
 * Le mode démonstration est demandé explicitement via NODE_ENV=demo dans le
 * processus de démarrage. Dans ce cas uniquement, .env.demo est chargé en
 * priorité. Sinon, le comportement reste strictement inchangé (.env).
 */
const startupNodeEnv = process.env.NODE_ENV;
const demoRequestedAtStartup = startupNodeEnv === 'demo';

if (demoRequestedAtStartup) {
  dotenv.config({ path: path.resolve(__dirname, '../../.env.demo') });
} else {
  // Charge toujours madarisk/backend/.env (indépendamment du cwd)
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
}
dotenv.config(); // fallback éventuel .env local / variables déjà exportées

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test', 'demo']).default('development'),
  PORT: z.coerce.number().default(5000),

  DEMO_MODE: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  DATABASE_URL: z.string().optional(),

  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().default('mada_risk'),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default('postgres'),
  DB_SSL: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  BCRYPT_SALT_ROUNDS: z.coerce.number().default(12),

  // Liste d' origines autorisées, séparées par des virgules : en production le
  // SPA est servi par l'API elle-même (port 5000), tandis qu'en développement
  // Vite répond sur 5173. Les deux doivent être acceptés.
  FRONTEND_URL: z.string().default('http://localhost:5173,http://localhost:5000'),

  OPEN_METEO_BASE_URL: z.string().default('https://api.open-meteo.com'),
  OPEN_METEO_TIMEOUT_MS: z.coerce.number().default(10000),
  // Jours de reanalyse demandes dans le meme appel que les observations, pour
  // alimenter la courbe horaire passee. 0 = uniquement l'heure courante et la
  // prevision. Ne pas augmenter sans verifier le quota : Open-Meteo pondere le
  // cout d'un appel par le nombre de jours x variables.
  OPEN_METEO_PAST_DAYS: z.coerce.number().int().min(0).max(7).default(1),

  // Plafond d'appels Open-Meteo que l'API s'autorise par jour UTC.
  //
  // L'offre gratuite est un plafond DUR de 10 000 appels, et une cle API ne
  // l'augmente pas : le depassement se paie en 429 jusqu'au reset de 00:00 UTC,
  // c'est-a-dire jusqu'a la perte de toutes les donnees meteo de la journee. Une
  // marge de 1000 sur 10 000 laisse la place a une relance manuelle d'urgence.
  OPEN_METEO_DAILY_BUDGET: z.coerce.number().int().min(1000).max(10000).default(9000),

  DGM_MAPROOM_BASE_URL: z.string().default('https://map.meteomadagascar.mg'),
  DGM_MAPROOM_TIMEOUT_MS: z.coerce.number().default(20000),
  DGM_MAPROOM_INGEST_CRON: z.string().default('0 6 * * *'),
  DGM_MAPROOM_MAX_DISTANCE_DEG: z.coerce.number().default(0.1),

  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-flash-latest'),
  GEMINI_TIMEOUT_MS: z.coerce.number().default(30000),
  GEMINI_MAX_RETRIES: z.coerce.number().int().min(0).default(2),
  AI_SUPER_ADMIN_VIEW_CONVERSATIONS: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  UPLOAD_DIR: z.string().default('uploads'),
  MAX_FILE_SIZE_MB: z.coerce.number().default(50),

  REPORTS_DIR: z.string().default('uploads/reports'),
  IMPORTS_DIR: z.string().default('uploads/imports'),

  ENABLE_SCHEDULED_JOBS: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  // Cadence dictée par le quota, pas par la météo.
  //
  // Open-Meteo ne compte pas les requêtes mais les COORDONNÉES : un run
  // national sur 1579 communes coûte ~1580 appels, et les lots de 400 partent
  // sans discontinuer. Le budget ci-dessous (1 run d'observations + 1 run de
  // prévisions, soit ~3160 appels/jour) laisse ~6800 appels de marge, soit
  // quatre relances complètes en cas de panne.
  //
  // Un seul run d'observations par jour : c'est ce qu'a réclamé l'épuisement du
  // 08/10, où le cron toutes les 6 h + le rattrapage au boot + les relances
  // manuelles ont dépassé le plafond de 10 000 avant midi. Les observations
  // Open-Meteo sont horaires et réanalysées : un point de situation quotidien
  // suffit pour la veille cyclone, et la carte affiche jusqu'à 25 h
  // d'ancienneté — le bandeau de fraîcheur le dit explicitement.
  //
  // 06:00 (heure Madagascar) tombe après le reset du quota à 00:00 UTC
  // (03:00 MG), et loin du cron de prévisions de 12 h 20.
  WEATHER_REFRESH_CRON: z.string().default('0 6 * * *'),
  WEATHER_OBSERVATION_CRON: z.string().default(process.env.WEATHER_REFRESH_CRON ?? '0 6 * * *'),
  // Volontairement décalé de 6 h après le cron d'observations (06 h 00). Les
  // deux à la même minute, les lots partaient en parallèle et Open-Meteo — qui
  // rationne par IP — refusait la requête (`too many concurrent requests`). Le
  // run d'observations pouvant durer 15 min quand il converge, l'écart doit
  // dépasser cette durée.
  //
  // Un seul run quotidien : les prévisions ne changent pas d'une demi-heure à
  // l'autre et un point de situation quotidien suffit pour la veille cyclone.
  // C'est ce qui finance la marge nécessaire aux relances manuelles.
  WEATHER_FORECAST_CRON: z.string().default('20 12 * * *'),
  // Doit dépasser la période du cron d'observations (24 h) sans la trop, sinon le
  // bandeau vire au rouge pendant le cycle normal. 1500 min = 24 h de cycle plus
  // 1 h de marge, donc un run complet peut être manqué avant que le bandeau ne
  // signale la péremption. Retenir deux cycles entiers (2880 min) le laisserait
  // vert pendant 24 h sur une panne.
  WEATHER_OBSERVATION_STALE_MINUTES: z.coerce.number().default(1500),
  // Idem côté prévisions : cycle de 24 h, seuil à 26 h.
  WEATHER_FORECAST_STALE_HOURS: z.coerce.number().default(26),

  // Rétention de `weather_hourly`. Chaque run réécrit une fenêtre glissante
  // (hier en réanalyse, J+2 en prévision) en DO UPDATE, mais les heures qui
  // sortent de la fenêtre ne sont plus réécrites : sans purge elles restent
  // définitivement, soit ~9 500 lignes orphelines par run et ~38 000 par jour
  // (~500 Mo/mois pour 1 579 communes). Sept jours couvrent largement la
  // fenêtre affichée (24 h de passé + 48 h de prévision) et laissent de la
  // marge pour comparer des journées.
  WEATHER_HOURLY_RETENTION_DAYS: z.coerce.number().int().min(2).default(7),
  // Purge quotidienne, volontairement décalée des crons météo (observations à
  // 6 h, prévisions à 12 h 20) et du recalcul de risque (chaque heure) : la
  // suppression porte sur des lignes déjà sorties de toute fenêtre affichée.
  WEATHER_HOURLY_PURGE_CRON: z.string().default('40 3 * * *'),

  RISK_RECALCULATION_CRON: z.string().default('10 * * * *'),

  DETECTION_NORMAL_CYCLES_BEFORE_MONITORING: z.coerce.number().int().min(1).default(3),
  DETECTION_MONITORING_HOURS: z.coerce.number().min(1).default(24),
  DETECTION_DEDUPE_HOURS: z.coerce.number().min(1).default(48),

  EXPOSURE_BUFFER_RADIUS_KM: z.coerce.number().min(1).default(25),
  EXPOSURE_TRAJECTORY_RADIUS_KM: z.coerce.number().min(1).default(50),

  ALERTS_AUTO_PUBLISH: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Variables d'environnement invalides :");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

/** Si DATABASE_URL est défini, aligne DB_HOST / DB_PORT / DB_NAME pour les logs et outils. */
function withUrlOverrides(data: z.infer<typeof envSchema>) {
  if (!data.DATABASE_URL) return data;
  try {
    const url = new URL(data.DATABASE_URL);
    return {
      ...data,
      DB_HOST: url.hostname || data.DB_HOST,
      DB_PORT: url.port ? Number(url.port) : data.DB_PORT,
      DB_NAME: url.pathname.replace(/^\//, '') || data.DB_NAME,
      DB_USER: url.username ? decodeURIComponent(url.username) : data.DB_USER,
      DB_PASSWORD: url.password ? decodeURIComponent(url.password) : data.DB_PASSWORD,
    };
  } catch {
    return data;
  }
}

export const DEMO_DATABASE_SUFFIX = '_demo';

/** Nom de base cible, sans jamais exposer les identifiants. */
export function resolveDatabaseName(input: { databaseUrl?: string; dbName?: string }): string {
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

export function isDemoDatabaseName(name: string): boolean {
  return name.length > 0 && name !== 'mada_risk' && name.endsWith(DEMO_DATABASE_SUFFIX);
}

export interface DemoEnvironmentCheck {
  DEMO_MODE: boolean;
  NODE_ENV: string;
  ENABLE_SCHEDULED_JOBS: boolean;
  DATABASE_URL?: string;
  DB_NAME: string;
}

/** Retourne la liste des incohérences bloquantes du mode démonstration. */
export function demoEnvironmentIssues(data: DemoEnvironmentCheck): string[] {
  if (!data.DEMO_MODE) return [];

  const issues: string[] = [];
  const dbName = resolveDatabaseName({ databaseUrl: data.DATABASE_URL, dbName: data.DB_NAME });

  if (data.NODE_ENV !== 'demo') {
    issues.push("NODE_ENV doit valoir 'demo' lorsque DEMO_MODE=true.");
  }
  if (data.ENABLE_SCHEDULED_JOBS !== false) {
    issues.push('ENABLE_SCHEDULED_JOBS doit être false en mode démonstration.');
  }
  if (!isDemoDatabaseName(dbName)) {
    issues.push(
      `La base cible doit se terminer par '${DEMO_DATABASE_SUFFIX}' (base détectée : ${
        dbName || 'aucune'
      }).`,
    );
  }

  return issues;
}

export const env = withUrlOverrides(parsed.data);

const demoIssues = demoEnvironmentIssues(env);
if (demoIssues.length > 0) {
  console.error('❌ Mode démonstration invalide :');
  for (const issue of demoIssues) {
    console.error(`  - ${issue}`);
  }
  console.error(
    '\nRefus de démarrage : le mode démonstration doit rester strictement isolé de la base de production.',
  );
  process.exit(1);
}
