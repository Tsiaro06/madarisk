import pg from 'pg';
import { assertDemoDatabaseOrExit } from './assert-demo-db';

export interface DemoContext {
  env: {
    DATABASE_URL?: string;
    DB_HOST: string;
    DB_PORT: number;
    DB_NAME: string;
    DB_USER: string;
    DB_PASSWORD: string;
    DB_SSL: boolean;
  } & Record<string, unknown>;
  dbName: string;
  connectionString: string;
  maintenanceConnectionString: string;
}

/**
 * Force NODE_ENV=demo AVANT d'importer la configuration applicative, afin que
 * `src/config/env.ts` charge `.env.demo` (et jamais `.env`).
 *
 * La configuration chargée est ensuite validée par la garde stricte.
 */
export async function loadDemoContext(): Promise<DemoContext> {
  if (process.env.NODE_ENV !== 'demo') {
    process.env.NODE_ENV = 'demo';
  }

  const { env } = await import('../../../src/config/env');

  const dbName = assertDemoDatabaseOrExit({
    databaseUrl: env.DATABASE_URL,
    dbName: env.DB_NAME,
  });

  const connectionString =
    env.DATABASE_URL ||
    `postgresql://${env.DB_USER}:${env.DB_PASSWORD}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`;

  const maintenanceConnectionString = buildMaintenanceConnectionString({
    databaseUrl: env.DATABASE_URL,
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
  });

  return {
    env,
    dbName,
    connectionString,
    maintenanceConnectionString,
  };
}

function buildMaintenanceConnectionString(input: {
  databaseUrl?: string;
  host: string;
  port: number;
  user: string;
  password: string;
}): string {
  if (input.databaseUrl) {
    try {
      const url = new URL(input.databaseUrl);
      url.pathname = '/postgres';
      return url.toString();
    } catch {
      // ignore, fallback below
    }
  }
  return `postgresql://${input.user}:${input.password}@${input.host}:${input.port}/postgres`;
}

export function createDemoPool(
  input: { connectionString: string; ssl: boolean },
  max = 1,
): pg.Pool {
  return new pg.Pool({
    connectionString: input.connectionString,
    ssl: input.ssl ? { rejectUnauthorized: false } : false,
    max,
  });
}

export function createMaintenancePool(ctx: DemoContext): pg.Pool {
  return new pg.Pool({
    connectionString: ctx.maintenanceConnectionString,
    ssl: ctx.env.DB_SSL ? { rejectUnauthorized: false } : false,
    max: 1,
  });
}
