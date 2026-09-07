# Déploiement

Ce guide couvre le déploiement de l'API MadaRisk Map (image Docker de production) et l'environnement éphémère Docker Compose.

## Image de production

`Dockerfile` multi-stage basé sur `node:20-alpine` :

| Étape | Contenu |
|---|---|
| `builder` | `npm ci` (toutes dépendances) → `npm run build` → `dist/` (openapi.yaml copié) |
| `runner` | `npm ci --omit=dev` → `dist/` copié → `uploads/imports` + `uploads/reports` créés |

- `ENV NODE_ENV=production`, `PORT=5000`, `EXPOSE 5000`.
- **HEALTHCHECK** : `GET /health` via le `fetch` global de Node (aucun `curl` requis) ; `interval 30s`, `timeout 5s`, `start-period 15s`.

### Variables obligatoires

- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (≥ 16 caractères) — sinon le processus s'arrête au démarrage (validation zod).
- `DATABASE_URL` (ou `DB_*`). Aucune valeur secrète par défaut dans l'image.

### Dockerfile

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
COPY database/ ./database/
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
RUN mkdir -p uploads/imports uploads/reports
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
```

## Docker Compose

### Stack éphémère (profil `db`)

```bash
cp .env.example .env
# renseigner JWT_ACCESS_SECRET / JWT_REFRESH_SECRET (+ éventuellement DATABASE_URL)
docker compose --profile db up --build
docker compose --profile db run --rm migrate   # schéma (créé if absent)
docker compose --profile db run --rm seed      # comptes de démo + organisation + source météo
```

Services :

| Service | Profil | Note |
|---|---|---|
| `api` | — | Port `5000:5000`, volume `./uploads:/app/uploads`, `.env` monté en lecture seule |
| `db` | `db` | PostGIS 16-3.4, volume `pgdata`, **aucun port publié** (isolé de l'hôte) |
| `migrate` | `db` | One-shot `npm run db:migrate` (image `builder` = tsx disponible) |
| `seed` | `db` | One-shot `npm run db:seed` |

`DATABASE_URL` est injectée via interpolation avec une valeur par défaut ciblant le service `db` de Compose :
`${DATABASE_URL:-postgres://postgres:postgres@db:5432/mada_risk}`.

### Utiliser une base existante (recommandé pour la production)

Ne pas activer le profil `db` et fournir `DATABASE_URL` :

```bash
docker compose up --build
# .env → DATABASE_URL=postgres://user:pass@host.docker.internal:5432/mada_risk
```

> Isolation garantie : le conteneur `db` de Compose n'utilise jamais le port `5432` de l'hôte ni les données locales `mada_risk` (volume dédié `pgdata`). Les migrations étant non destructives, elles n'affectent pas les 119 districts / 1579 communes.

## Déploiement en production (fly.io / Render / VPS)

1. **Base** : PostgreSQL managé + extension PostGIS activée (même compte base).
2. **Migrations** : `npm run db:migrate` (build manuel) **ou** `docker compose run --rm migrate` avec `DATABASE_URL` vers la base distante.
3. **Secrets** : `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `GEMINI_API_KEY` (si IA), `FRONTEND_URL` (CORS), `DATABASE_URL` → stockés dans le secrétariat de la plateforme, jamais dans `.env` versionné.
4. **Jobs planifiés** : activer `ENABLE_SCHEDULED_JOBS=true` **sur un seul réplica** (éviter les doubles exécutions) ; sinon configurer les crons externe.
5. **Uploads** : persister `uploads/` (volume / stockage objet). `MAX_FILE_SIZE_MB` (défaut 50) à ajuster avec les reverse-proxys.
6. **Healthcheck** : utiliser `GET /health` du conteneur ; activer le rate-limit global (par défaut actif).
7. **Resilience IA/météo** : l'API tolère la panne d'Open-Meteo (502 localisé) et de Gemini (503 localisé) sans redémarrage.

## Checklist avant mise en ligne

- [ ] `NODE_ENV=production`
- [ ] Secrets JWT uniques et longs ; `GEMINI_API_KEY` gérée (ou IA laissée `503`)
- [ ] `FRONTEND_URL` = bonne origine CORS
- [ ] Migrations appliquées (non destructives) ; `npm run db:check` OK
- [ ] Jobs planifiés mono-réplica
- [ ] `uploads/` persistant ; permissions conteneur restreintes
- [ ] Logs Pino : redaction active (tokens/passwords), niveau `LOG_LEVEL` adapté