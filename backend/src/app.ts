import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { env } from './config/env';
import { registerDocsRoutes } from './config/swagger';
import { httpLogger, logger } from './config/logger';
import { successResponse } from './utils/api-response';
import routes from './routes';
import { errorHandler } from './middlewares/error.middleware';
import { notFoundHandler } from './middlewares/not-found.middleware';

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: env.FRONTEND_URL.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: env.NODE_ENV === 'development' ? 2000 : 100,
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

// En production, l'API sert aussi le SPA compilé. Un seul processus Node
// suffit alors à faire tourner l'application ET le pipeline de synchronisation
// météo : c'est ce qui permet aux données de rester à jour même après l'arrêt
// de `npm run dev`. En développement, Vite sert le front sur 5173 et proxifie
// `/api` vers ici — les deux peuvent tourner en parallèle sans conflit de port.
const frontendDist = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
if (env.NODE_ENV === 'production' && fs.existsSync(path.join(frontendDist, 'index.html'))) {
  // `index: false` : la racine `/` doit rester gérée par la logique ci-dessous.
  app.use(express.static(frontendDist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res, next) => {
    // Les routes d'API inconnues doivent toujours répondre 404 en JSON, pas
    // recevoir l'index.html du SPA.
    if (req.path.startsWith('/api') || req.path === '/health') {
      next();
      return;
    }
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
  logger.info({ frontendDist }, 'Frontend compilé servi par l’API (SPA)');
}

app.use(notFoundHandler);

app.use(errorHandler);

export default app;
