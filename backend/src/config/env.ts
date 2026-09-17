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

  FRONTEND_URL: z.string().default('http://localhost:5173'),

  OPEN_METEO_BASE_URL: z.string().default('https://api.open-meteo.com'),
  OPEN_METEO_TIMEOUT_MS: z.coerce.number().default(10000),

  DGM_MAPROOM_BASE_URL: z.string().default('https://map.meteomadagascar.mg'),
  DGM_MAPROOM_TIMEOUT_MS: z.coerce.number().default(20000),
  DGM_MAPROOM_INGEST_CRON: z.string().default('0 6 * * *'),
  DGM_MAPROOM_MAX_DISTANCE_DEG: z.coerce.number().default(0.1),

  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.0-flash'),
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
  WEATHER_REFRESH_CRON: z.string().default('0 */4 * * *'),
  WEATHER_OBSERVATION_CRON: z.string().default(process.env.WEATHER_REFRESH_CRON ?? '0 * * * *'),
  WEATHER_FORECAST_CRON: z.string().default('0 */3 * * *'),
  WEATHER_OBSERVATION_STALE_MINUTES: z.coerce.number().default(150),
  WEATHER_FORECAST_STALE_HOURS: z.coerce.number().default(6),
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
