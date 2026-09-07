# Architecture

Vue d'ensemble technique du backend **MadaRisk Map**.

## Organigramme

```
Client (React + Leaflet)
        │  HTTPS / JSON (Bearer JWT)
        ▼
┌─────────────────────────────────────────────────────────────┐
│ Express API                                                 │
│   src/app.ts                                                │
│   ├─ helmet()               (en-têtes HTTP sécurisés)        │
│   ├─ cors(FRONTEND_URL)     (CORS restreint)                 │
│   ├─ rateLimit()            (100 req / 15 min)               │
│   ├─ express.json()         (limite 10 Mo)                   │
│   ├─ pino-http()            (logs structurés + redaction)    │
│   ├─ registerDocsRoutes()   (/api/docs + /api-docs)          │
│   ├─ GET /health            (healthcheck)                    │
│   └─ /api/v1                (16 sous-routeurs)               │
│       └─ errorHandler / notFoundHandler                      │
└───────────────┬─────────────────────────────────────────────┘
                ▼
┌─────────────────────────────────────────────────────────────┐
│ Layers métier                                               │
│   routes/        → validation zod (validators/)             │
│   controllers/   → orchestration HTTP (enveloppes)          │
│   services/      → règles métier, transactions              │
│   repositories/  → SQL PostgreSQL + PostGIS                 │
└───────────────┬─────────────────────────────────────────────┘
                ▼
        PostgreSQL 16 + PostGIS 3.4
        (extensions, vues, fonctions, triggers)
                │
                ├── Open-Meteo (météo)    [externe, HTTP]
                ├── Gemini (IA)           [externe, SDK]
                └── Uploads (imports/reports) [système de fichiers]
```

## Couches logicielles

### 1. Routage (`src/routes/*.routes.ts`)

Chaque sous-routeur est monté sous `/api/v1` (voir `src/routes/index.ts`) :

`/health`, `/system`, `/auth`, `/users`, `/territories`, `/imports`, `/matching`, `/events`, `/weather`, `/risks`, `/risk-configurations`, `/alerts`, `/dashboard`, `/reports`, `/ai`.

Chaque route applique, dans l'ordre :
1. **`authenticate`** (lecture + vérification du Bearer JWT, purge du `req.user`),
2. **`authorize(...)`** (rôles autorisés, éventuellement au niveau du routeur pour les préfixes homogènes : `imports`, `matching`, `users`),
3. **`validate({ body|query|params })`** (zod ; en cas d'échec → 422 détaillé),
4. le **contrôleur**.

### 2. Contrôleurs (`src/controllers/*`)

Rôle : parsing (avec les entrées validées typées via `req.validatedBody/Query/Params`), appel du service, réponse enveloppée.

- Succès : `successResponse(data, message, meta?)` → `{ success, message, data, meta? }`.
- Erreur : levée d'`AppError(status, message)` puis prise en charge par `errorHandler`.
- Pagination : `paginate(page, limit, total)` → `meta: { page, limit, total, totalPages }`.

### 3. Services (`src/services/*`)

Règles métier et transactions :
- `auth.service` : création des jetons, rotation, révocation, création du premier SUPER_ADMIN.
- `users.service` : gardes de rôles (défense en profondeur derrière le middleware), derniers SUPER_ADMIN protégés.
- `events.service` : cycle de vie, trajectoires (PostGIS `ST_`), cercles d'influence, exposition.
- `weather.service` : Open-Meteo (coord. par commune), observations/ prévisions.
- `risk.service` : moteur pondéré (voir `docs/risk-engine.md`).
- `ai.service` : orchestration Gemini + filtrage de sûreté.

### 4. Répositories (`src/repositories/*`)

Requêtes SQL paramétrées sur PostgreSQL / PostGIS (agrégeats typés `Pg`), utilisées par les services. Tous les identifiants sont des UUID v4.

### 5. Infrastructure (`src/config/*`)

- `env.ts` : variables d'environnement validées par zod au démarrage (arrêt immédiat si critique).
- `database.ts` : pool `node-postgres`, `healthCheck()` (`SELECT 1` + extensions).
- `logger.ts` : Pino avec **redaction** (`accessToken`, `refreshToken`, `password`, `Authorization`).
- `swagger.ts` : chargement `openapi.yaml` + montage Swagger UI sur `/api/docs` et `/api-docs`.

## Tâches planifiées (cron)

Optionnellement, le serveur planifie des tâches récurrentes pilotées par `ENABLE_SCHEDULED_JOBS` (désactivées par défaut) :
- `WEATHER_REFRESH_CRON` (par défaut `0 * * * *`) : rafraîchit les observations météo.
- `RISK_RECALCULATION_CRON` (par défaut `10 * * * *`) : recalculation des risques.

Chaque exécution est loggée via Pino et les échecs sont repris à l'itération suivante.

## Décisions clés

- **Enveloppe de réponse unique** : `{ success, message, data, meta }` pour toutes les routes (maintient une intégration frontend simple).
- **Erreurs standardisées** : `{ success: false, message, errors?[] }`.
- **GeoJSON partout** pour la cartographie : les couches Leaflet (territoires, occurrences, météo, risques, trajectoires, zones) consomment des `FeatureCollection` directement.
- **Résilience externe** : Open-Meteo et Gemini échouent en `502`/`503` propres, sans faire tomber l'API.