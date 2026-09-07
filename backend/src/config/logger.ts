import pino from 'pino';
import pinoHttp from 'pino-http';
import type { IncomingMessage } from 'http';
import { env } from './env';

const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'proxy-authorization', 'x-api-key']);

function sanitizeHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (SENSITIVE_HEADERS.has(key.toLowerCase())) continue;
    clean[key] = value;
  }
  return clean;
}

export function reqSerializer(req: IncomingMessage): Record<string, unknown> {
  return {
    ...pino.stdSerializers.req(req),
    headers: sanitizeHeaders((req.headers ?? {}) as Record<string, unknown>),
  };
}

export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino/file', options: { destination: 1 } }
      : undefined,
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    err: pino.stdSerializers.err,
    req: reqSerializer,
    res: pino.stdSerializers.res,
  },
});

export const httpLogger = pinoHttp({
  logger,
  serializers: {
    req: reqSerializer,
  },
});
