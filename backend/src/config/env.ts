import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),

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

  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.0-flash'),
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
  WEATHER_REFRESH_CRON: z.string().default('0 * * * *'),
  RISK_RECALCULATION_CRON: z.string().default('10 * * * *'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Variables d'environnement invalides :");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
