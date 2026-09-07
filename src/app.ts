import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { registerDocsRoutes } from './config/swagger';
import { httpLogger } from './config/logger';
import { successResponse } from './utils/api-response';
import routes from './routes';
import { errorHandler } from './middlewares/error.middleware';
import { notFoundHandler } from './middlewares/not-found.middleware';

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Trop de requêtes, veuillez réessayer plus tard.' },
  }),
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(httpLogger);

registerDocsRoutes(app);

app.get('/health', (_req, res) => {
  res.status(200).json(
    successResponse(
      {
        status: 'ok',
        environment: env.NODE_ENV,
        timestamp: new Date().toISOString(),
      },
      'API MadaRisk Map opérationnelle.',
    ),
  );
});

app.use('/api/v1', routes);

app.use(notFoundHandler);

app.use(errorHandler);

export default app;
