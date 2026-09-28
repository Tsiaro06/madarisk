import path from 'path';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';

export const docsPath = path.join(__dirname, '..', 'docs', 'openapi.yaml');

export const swaggerSpec = YAML.load(docsPath) as Record<string, unknown>;

export const swaggerUiPaths = ['/api/docs', '/api-docs'];

export function registerDocsRoutes(app: express.Application): void {
  app.get('/api/docs/swagger.json', (_req, res) => {
    res.json(swaggerSpec);
  });
  app.get('/api-docs/swagger.json', (_req, res) => {
    res.json(swaggerSpec);
  });

  for (const routePath of swaggerUiPaths) {
    app.use(
      routePath,
      swaggerUi.serve,
      swaggerUi.setup(swaggerSpec, { customSiteTitle: 'MadaRisk Map - API Docs' }),
    );
  }
}
