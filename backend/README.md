# MadaRisk Map — Backend API

Plateforme SIG de surveillance et d'anticipation des catastrophes naturelles à Madagascar.

Ce dépôt contient le **backend** de la plateforme, développé en **Node.js / Express / TypeScript** sur une base **PostgreSQL + PostGIS**. Il expose une API REST complète : authentification, territoires (districts & communes réels), événements cycloniques, trajectoires, zone d'influence et exposition, météo, moteur de risque, alertes, tableau de bord, rapports & exports (CSV / PDF / GeoJSON) et un **assistant IA** (Gemini).

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Fonctionnalités clés](#2-fonctionnalités-clés)
3. [Architecture (aperçu)](#3-architecture-aperçu)
4. [Stack technique](#4-stack-technique)
5. [Prérequis](#5-prérequis)
6. [Structure du projet](#6-structure-du-projet)
7. [Installation](#7-installation)
8. [Variables d'environnement](#8-variables-denvironnement)
9. [Commandes utiles](#9-commandes-utiles)
10. [Démarrage local pas à pas](#10-démarrage-local-pas-à-pas)
11. [Migrations et base de données](#11-migrations-et-base-de-données)
12. [Seeds et utilisateurs de démonstration](#12-seeds-et-utilisateurs-de-démonstration)
13. [Documentation API (Swagger)](#13-documentation-api-swagger)
14. [Authentification & utilisateurs (Phase 4)](#14-authentification--utilisateurs-phase-4)
15. [Territoires (Phase 5)](#15-territoires-phase-5)
16. [Imports & matching (Phase 6)](#16-imports--matching-phase-6)
17. [Événements, trajectoires & exposition (Phase 7)](#17-événements-trajectoires--exposition-phase-7)
18. [Météo & moteur de risque (Phase 8)](#18-météo--moteur-de-risque-phase-8)
19. [Alertes & tableau de bord (Phase 9)](#19-alertes--tableau-de-bord-phase-9)
20. [Rapports & exports (Phase 10)](#20-rapports--exports-phase-10)
21. [Assistant IA (Phase 11)](#21-assistant-ia-phase-11)
22. [Sécurité](#22-sécurité)
23. [Docker](#23-docker)
24. [Tests](#24-tests)

---

## 1. Vue d'ensemble

MadaRisk Map est un outil de **gestion de crise** pour Madagascar : il agrège les données territoriales (119 districts, 1579 communes), les événements cycloniques et leurs trajectoires, les données météo (Open-Meteo), puis calcule un **score de risque** par commune (pluie, vent, proximité de l'événement, vulnérabilité, exposition). Il publie des alertes, alimente un tableau de bord et génère des rapports. Un assistant IA répond aux questions de renseignement sur la situation en cours.

## 2. Fonctionnalités clés

- Authentification **JWT** (access + refresh avec rotation), sessions en base, rôles `SUPER_ADMIN / ADMIN / ANALYSTE_SIG / CLIENT`.
- Référentiel territorial complet avec réponses **GeoJSON Leaflet** prêtes à l'emploi.
- Import de fichiers **GeoJSON / JSON / CSV** et **matching automatique** vers les territoires (code exact → nom normalisé → alias → similarité), avec validation manuelle.
- Suivi d'événements : création, bugs, **trajectoires**, **zones d'influence** (cercles), **calcul d'exposition** (population, ménages, superficie), communes exposées.
- Météo : observations horaires, prévisions 7 jours, rafraîchissement depuis **Open-Meteo**, couches cartographiques.
- **Moteur de risque** pondéré et configurable (poids + seuils par configuration), recalculation par événement / communes / district / phase.
- **Alertes** (brouillon → publiée → archivée) ciblées par événement, district ou commune.
- Tableau de bord (résumé, répartition des risques, chronologie, communes prioritaires).
- **Rapports & exports** CSV / PDF / GeoJSON + téléchargement des rapports générés.
- **Assistant IA Gemini** avec politique de sûreté, vue des conversations selon le rôle.

## 3. Architecture (aperçu)

```
Client (React + Leaflet)
        │  HTTPS / JSON (Bearer JWT)
        ▼
   Express API  (src/app.ts)
   ├─ Middlewares : helmet, cors, rate-limit global, pino-http, validation zod
   ├─ Routage    : src/routes/* (16 sous-routeurs montés sous /api/v1)
   ├─ Services   : src/services/* (logique métier, accès base)
   ├─ Répos      : src/repositories/* (SQL PostgreSQL + PostGIS)
   └─ Config     : env, database (pool), logger, swagger
        │
        ▼
 PostgreSQL 16 + PostGIS 3.4  (extensions, vues, fonctions, triggers)
        │
        ├─ Sources externes : Open-Meteo (météo), Gemini (IA)
        ├─ Cron (NOTIFY/événement) : rappels planifiés des tâches
        └─ Fichiers : uploads/imports (SIG), uploads/reports (PDF/CSV/GeoJSON)
```

Voir [`docs/architecture.md`](docs/architecture.md) pour le détail.

## 4. Stack technique

| Composant | Choix |
|---|---|
| Runtime | Node.js 20 (LTS) |
| Langage | TypeScript (strict) |
| Framework | Express.js 4 |
| Base de données | PostgreSQL 16 + PostGIS 3.4 |
| Validation | Zod |
| Auth | JWT + bcrypt (coût 12) |
| Logs | Pino + pino-http |
| Sécurité HTTP | Helmet, CORS, express-rate-limit |
| Géométries | GeoJSON (PostGIS) |
| Météo | Open-Meteo (REST) |
| IA | Google Gemini (SDK officiel) |
| Tests | Vitest + Supertest (v8 coverage) |
| Docker | Multi-stage, alpine node:20 |

## 5. Prérequis

- **Node.js ≥ 20** (npm ≥ 10)
- **PostgreSQL 16** avec l'extension **PostGIS 3.4**
- Optionnel : Docker + Docker Compose (pour un environnement éphémère, voir [Docker](#23-docker))

## 6. Structure du projet

```
backend/
├── src/
│   ├── app.ts                 # Application Express (middlewares, swagger, routes)
│   ├── server.ts              # Démarrage HTTP
│   ├── config/
│   │   ├── env.ts             # Variables d'environnement (zod, validation au démarrage)
│   │   ├── database.ts        # Pool PostgreSQL + healthCheck
│   │   ├── logger.ts          # Pino (redaction des secrets)
│   │   └── swagger.ts         # Chargement OpenAPI + montage /api/docs et /api-docs
│   ├── docs/
│   │   └── openapi.yaml       # Spécification OpenAPI 3.0.3 (tous les endpoints)
│   ├── routes/                # 16 sous-routeurs Express
│   ├── controllers/           # 13 contrôleurs HTTP
│   ├── services/              # Logique métier
│   ├── repositories/          # Requêtes SQL (PostgreSQL / PostGIS)
│   ├── middlewares/           # authenticate, authorize, validate, upload, rate-limit, error, not-found
│   ├── validators/            # Schémas zod
│   ├── utils/                 # api-response, app-error, async-handler, ...
│   └── types/
├── database/
│   ├── migrations/            # SQL versionné (001..011), table _migrations
│   ├── scripts/               # migrate.ts, seed.ts, check-database.ts, ...
│   └── seeds/                 # Données démo optionnelles
├── tests/
│   ├── unit/                  # Tests unitaires (pures fonctions)
│   ├── integration/           # Tests d'API (Supertest + base réelle)
│   ├── fixtures/              # districts.csv, districts.geojson, ...
│   └── helpers/               # Harness de test / création de contexte
├── uploads/
│   ├── imports/               # Fichiers SIG importés
│   └── reports/               # Rapports générés
├── docs/                      # Documentation technique détaillée
│   ├── architecture.md
│   ├── database.md
│   ├── api.md
│   ├── imports-matching.md
│   ├── risk-engine.md
│   ├── ai-security.md
│   └── deployment.md
├── Dockerfile                 # Image multi-stage de production
├── docker-compose.yml         # API + PostgreSQL/PostGIS (env éphémère)
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env.example
└── README.md
```

## 7. Installation

```bash
cd backend
cp .env.example .env          # puis renseigner les secrets (voir plus bas)
npm install
```

## 8. Variables d'environnement

Le fichier `.env.example` liste toutes les variables. Les plus importantes :

| Variable | Défaut | Description |
|---|---|---|
| `NODE_ENV` | `development` | `development` / `test` / `production` |
| `PORT` | `5000` | Port HTTP de l'API |
| `FRONTEND_URL` | `http://localhost:5173` | Origine CORS autorisée |
| `DATABASE_URL` | — | Chaîne de connexion (Priorité 1 sur les variables `DB_*`) |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | `localhost` / `5432` / `mada_risk` / `postgres` / `postgres` | Connexion si `DATABASE_URL` absente |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | — | **Secrets JWT (min 16 caractères, obligatoires)** |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | `15m` / `7d` | Durées de vie |
| `BCRYPT_SALT_ROUNDS` | `12` | Coût bcrypt |
| `GEMINI_API_KEY` | vide | Clé Google Gemini (vide = IA désactivée, le chat répond 503) |
| `GEMINI_MODEL` | `gemini-2.0-flash` | Modèle Gemini |
| `AI_SUPER_ADMIN_VIEW_CONVERSATIONS` | `false` | Vue globale des conversations SUPER_ADMIN |
| `UPLOAD_DIR` / `MAX_FILE_SIZE_MB` | `uploads` / `50` | Dossier racine des uploads et taille max |
| `IMPORTS_DIR` / `REPORTS_DIR` | `uploads/imports` / `uploads/reports` | Sous-répertoires des fichiers SIG et rapports |
| `ENABLE_SCHEDULED_JOBS` | `false` | Activer les tâches planifiées |
| `WEATHER_REFRESH_CRON` / `RISK_RECALCULATION_CRON` | `0 * * * *` / `10 * * * *` | Plannings crontab (météo, risques) |
| `OPEN_METEO_BASE_URL` / `OPEN_METEO_TIMEOUT_MS` | `https://api.open-meteo.com` / `10000` | API et timeout météo |
| `LOG_LEVEL` | `info` | Niveau des logs Pino |

> Toutes les variables sont validées au démarrage (zod). Une variable manquante critique arrête le serveur avec un message explicite.

## 9. Commandes utiles

| Commande | Description |
|---|---|
| `npm run dev` | Serveur de développement (hot reload) |
| `npm run build` | Compiler TypeScript (copie `openapi.yaml` dans `dist/docs`) |
| `npm start` | Démarrer en production (après `build`) |
| `npm run lint` | ESLint sur `src/` (± 0 avertissement) |
| `npm run lint:fix` | Corriger automatiquement |
| `npm run typecheck` | `tsc --noEmit` sur les sources |
| `npm run typecheck:test` | Sources + tests |
| `npm run format` / `npm run format:check` | Prettier (sources) |
| `npm test` | Vitest (unit + intégration) |
| `npm run test:coverage` | Vitest + rapport de couverture (v8, HTML) |
| `npm run db:migrate` | Appliquer les migrations SQL versionnées |
| `npm run db:seed` | Insérer les données de démonstration |
| `npm run db:check` | Vérifier la connexion, PostGIS, comptes districts/communes |

## 10. Démarrage local pas à pas

1. Créer la base : `CREATE DATABASE mada_risk;`
2. Activer PostGIS : `CREATE EXTENSION IF NOT EXISTS postgis;` (ou migrer, cf. ci-dessous).
3. `cp .env.example .env` puis renseigner `JWT_ACCESS_SECRET` et `JWT_REFRESH_SECRET`.
4. `npm run db:migrate`
5. `npm run db:seed`
6. `npm run dev`
7. Vérifier : `GET http://localhost:5000/health` → `{"data":{"status":"ok","database":"connected"}}`
8. Swagger : `http://localhost:5000/api/docs`
9. Se connecter (si `db:seed` a créé les comptes — voir section 12) : `POST /auth/login`.

## 11. Migrations et base de données

- Les migrations sont des fichiers SQL numérotés (`001..011`) dans `database/migrations/`, suivis par la table `_migrations` (tri automatique par ordre numérique).
- Commandes : `npm run db:migrate` (appliquer), `npm run db:check` (diagnostic PostGIS + comptes).
- Les migrations sont **non destructives** : aucun `DROP TABLE`, `TRUNCATE` ou `DELETE` sur les données de référence (districts / communes).
- Référentiel : **119 districts**, **1579 communes** (+ population, ménages, géométries PostGIS).
- Vues & fonctions : agrégeats de risque (PostGIS), triggers d'historique des évaluations.

Détails dans [`docs/database.md`](docs/database.md).

## 12. Seeds et utilisateurs de démonstration

`npm run db:seed` est **idempotent** et ne crée les comptes que si la table `users` est vide :

| Rôle | Email | Mot de passe |
|---|---|---|
| `SUPER_ADMIN` | `admin@madarisk.mg` | `Admin@123!` |
| `ADMIN` | `operator@madarisk.mg` | `Operator@123!` |

Le seed crée aussi (si absents) : l'organisation **MadaRisk Organisation**, la **configuration de risque par défaut** et la source météo **Open-Meteo**.

> En production, créer le premier compte via `POST /auth/register` (disponible uniquement si la table `users` est vide) et **ne pas** utiliser les mots de passe de démonstration.

## 13. Documentation API (Swagger)

La spécification OpenAPI 3.0.3 (`src/docs/openapi.yaml`) est servie par Swagger UI sur **deux URL** :

```text
http://localhost:5000/api/docs   ← point d'entrée principal
http://localhost:5000/api-docs   ← alias de compatibilité
```

- Utiliser **Authorize** avec `Bearer <ACCESS_TOKEN>` pour tester les endpoints protégés.
- 68 chemins documentés, exemples inclus (cyclone, trajectoire, zone d'influence, alerte, question IA, GeoJSON).
- Le YAML est copié dans `dist/docs` lors du `npm run build`.

## 14. Authentification & utilisateurs (Phase 4)

Auth par paires de jetons JWT (access + refresh **avec rotation**), sessions stockées en base, **logs d'audit** sur les actions sensibles.

### Rôles

| Rôle | Droits |
|---|---|
| `SUPER_ADMIN` | Toutes opérations ; gestion des utilisateurs, rôles et statuts ; suppression d'événements |
| `ADMIN` | Gestion opérationnelle (événements, alertes, météo, risques, rapports) |
| `ANALYSTE_SIG` | Imports & matching |
| `CLIENT` | Consultation |

### Endpoints clés (`/api/v1`)

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| `POST` | `/auth/register` | public | Premier SUPER_ADMIN (table `users` vide uniquement) |
| `POST` | `/auth/login` | public | Connexion (10/15 min) |
| `POST` | `/auth/refresh` | public | Rafraîchir la session (30/15 min) |
| `POST` | `/auth/logout` | public* | Révoquer la session (`refreshToken` dans le corps) |
| `GET` | `/auth/me` | connecté | Profil |
| `GET` | `/users` | SUPER_ADMIN | Liste paginée |
| `POST` | `/users` | SUPER_ADMIN | Créer |
| `GET` | `/users/:id` | SUPER_ADMIN ou propriétaire | Détail |
| `PATCH` | `/users/:id` | SUPER_ADMIN ou propriétaire | Modifier (rôle → SUPER_ADMIN) |
| `PATCH` | `/users/:id/status` | SUPER_ADMIN | Activer/désactiver (`{"isActive": false}`) |
| `PATCH` | `/users/me/password` | connecté | Changer son mot de passe |

*`logout` ne nécessite pas de bearer : il prend le `refreshToken` en corps et le révoque.

## 15. Territoires (Phase 5)

Exposition des districts et communes réels (fichiers SIG) via REST, avec pagination, filtres et réponses **GeoJSON Leaflet**.

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/territories/districts` | Liste paginée (`search`, `adminCode`, `includeGeometry`) |
| `GET` | `/territories/districts/:id` | Détail |
| `GET` | `/territories/communes` | Liste paginée (`districtId`, `districtCode`, `riskLevel`, `eventId`, ...) |
| `GET` | `/territories/communes/:id` | Détail enrichi (météo, risque, événements) |
| `GET` | `/territories/search?q=...&limit=...` | Recherche (q ≥ 2) |
| `GET` | `/territories/map/districts` | FeatureCollection GeoJSON |
| `GET` | `/territories/map/communes` | FeatureCollection enrichie (risque, phase, météo) |

## 16. Imports & matching (Phase 6)

Réservé **ANALYSTE_SIG / SUPER_ADMIN**.

- `POST /imports` : fichier `multipart` (`file`: `.geojson`, `.json`, `.csv`, max 50 Mo ; `territoryType`, `sourceName`). L'import est analysé (enregistrements valides / erreurs).
- `GET /imports`, `GET /imports/:id`, `GET /imports/:id/errors`.
- `POST /matching/run/:importId` : matching par priorité **code exact → nom normalisé → alias → similarité** ; candidatures `EN_ATTENTE` (jamais auto-validées), cas `AMBIGU`, `REJETE` possible.
- `GET /matching` (filtres `status`, `targetType`, `minConfidence`, `maxConfidence`), `POST /:id/approve`, `POST /:id/reject` (note obligatoire), `POST /manual-link`, `GET /statistics`.

Détails et formats dans [`docs/imports-matching.md`](docs/imports-matching.md).

## 17. Événements, trajectoires & exposition (Phase 7)

Système de suivi des **cyclones** (et autres aléas) avec cycle de vie `BROUILLON → PREVISION → ACTIF → SUIVI → CLOTURE`.

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| `POST` | `/events` | ADMIN/SUPER_ADMIN | Créer (eventCode, nom, type, sévérité, dates) |
| `GET` | `/events` | connecté | Liste paginée (filtres type/statut/séverité/dates/recherche) |
| `GET` / `PATCH` / `DELETE` | `/events/:id` | — / ADMIN / SUPER_ADMIN | Détail, modification, suppression |
| `PATCH` | `/events/:id/status` | ADMIN | Changer le statut |
| `POST` | `/events/:id/tracks` | ADMIN | Ajouter un point de trajectoire (obs/prevu, vent, pression, ...) |
| `GET` | `/events/:id/tracks` | connecté | Points de trajectoire (`?trackType=`) |
| `GET` | `/events/:id/track-geojson` | connecté | Trajectoire GeoJSON (LineString/points) |
| `POST` | `/events/:id/areas/calculate` | ADMIN | Zone d'influence (phase + niveau + rayon 1-500 km) |
| `GET` | `/events/:id/areas` | connecté | Zones d'influence (cercles GeoJSON) |
| `POST` | `/events/:id/exposure/calculate` | ADMIN | Calcul d'exposition (population, ménages, superficie) |
| `POST` | `/events/:id/risks/recalculate` | ADMIN | Recalcul des risques des communes exposées |
| `GET` | `/events/:id/exposed-communes` | connecté | Communes exposées (paginées, filtres) |

Exemples (création de cyclone, point de trajectoire, zone d'influence) dans Swagger.

## 18. Météo & moteur de risque (Phase 8)

### Météo (Open-Meteo)

- `GET /weather/communes/:communeId/latest` : dernière observation.
- `GET /weather/communes/:communeId/forecast` : prévisions 7 jours.
- `GET /weather/communes/:communeId/history` : historique (filtres `dateFrom`/`dateTo`).
- `GET /weather/map-layer` : couche GeoJSON (filtres `districtId`, `eventId`, `observedAt`).
- `POST /weather/refresh/communes` (ADMIN/SUPER_ADMIN) : synchroniser (filtres `communeIds`/`districtId`/`eventId` ou `confirmAll`).

### Moteur de risque

Score de risque = pondération **pluie + vent + proximité + vulnérabilité + exposition** (poids par défaut 0,30 / 0,25 / 0,20 / 0,15 / 0,10), traduit en niveau `FAIBLE | MODERE | ELEVE | EXTREME` selon les seuils (20 / 40 / 60 / 80).

- `GET /risks/communes/:communeId?eventId=&latest=` : évaluation d'une commune.
- `GET /risks/priority-communes` : classement des communes prioritaires.
- `GET /risks/map-layer` : couche GeoJSON de risques.
- `POST /risks/recalculate` (ADMIN/SUPER_ADMIN) : recalcul (périmètre événement / communes / district, phase).
- `GET/POST/PATCH /risk-configurations[/:id]` : configurations (création/édition réservées SUPER_ADMIN ; somme des poids = 1, seuils croissants).

Explications détaillées du calcul dans [`docs/risk-engine.md`](docs/risk-engine.md).

## 19. Alertes & tableau de bord (Phase 9)

### Alertes

- `POST /alerts` (ADMIN/SUPER_ADMIN) : créer (type `CYCLONE|INONDATION|FORTE_PLUIE|VENT_VIOLENT|SECHERESSE|INFORMATION|URGENCE`, sévérité, titre, message, cible `eventId` **ou** `districtId` **ou** `communeId`).
- `GET /alerts`, `GET /alerts/:id` : consultation.
- `PATCH /alerts/:id`, `POST /alerts/:id/publish`, `POST /alerts/:id/archive` : gestion du cycle `BROUILLON → PUBLIEE → ARCHIVEE / EXPIREE`.

### Tableau de bord

- `GET /dashboard/summary` : événements actifs, alertes actives, communes à risque, population à risque.
- `GET /dashboard/risk-distribution` : répartition des niveaux.
- `GET /dashboard/events-timeline?dateFrom=&dateTo=` : chronologie.
- `GET /dashboard/priority-communes` : communes prioritaires.

## 20. Rapports & exports (Phase 10)

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| `GET` | `/reports/dashboard` | ADMIN/SUPER_ADMIN | Rapport global (filtres dates) |
| `GET` | `/reports/events/:eventId` | connecté | Rapport détaillé d'un événement |
| `POST` | `/reports/export/csv` | connecté | Export CSV (`resourceType` : communes, districts, events, alerts, risks, exposed-communes) |
| `POST` | `/reports/export/geojson` | connecté | Export GeoJSON (`resourceType` : communes, districts, event-areas, risks) |
| `POST` | `/reports/export/pdf` | ADMIN/SUPER_ADMIN | Génération PDF (fichier renvoyé) |
| `GET` | `/reports` | ADMIN/SUPER_ADMIN | Liste des rapports générés |
| `GET` | `/reports/:id/download` | ADMIN/SUPER_ADMIN | Téléchargement |

Les fichiers générés sont stockés dans `uploads/reports` (volume monté en Docker). Formats enregistrés : `PDF | CSV | XLSX | GEOJSON | PNG`.

## 21. Assistant IA (Phase 11)

Assistant de renseignement alimenté par **Gemini**, conscient du contexte opérationnel : il agrège événements actifs, alertes, risques et météo pour répondre en langage naturel (français / malgache / anglais).

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| `POST` | `/ai/chat` | connecté | Réponse IA (`message` requis, `conversationId` optionnel pour poursuivre) |
| `GET` | `/ai/conversations` | connecté | Liste des conversations (max 50) |
| `GET` / `DELETE` | `/ai/conversations/:id` | propriétaire | Détail (messages) / suppression |

Comportements & garde-fous (politique de sûreté, rôles, `503` quand non configuré) : [`docs/ai-security.md`](docs/ai-security.md).

## 22. Sécurité

- **JWT** : access (15 min) + refresh (7 jours) avec rotation ; sessions révoquables en base ; secrets via environnement.
- **bcrypt** coût 12 ; `passwordHash` **jamais** exposé (sanitisation systématique).
- **Rate limiting** : global 100 req/15 min ; login 10/15 min ; refresh 30/15 min ; IA 30/15 min.
- **Helmet + CORS** restreint à `FRONTEND_URL` + validation par **Zod** sur tout le périmètre (→ 422 détaillé).
- **Zones d'accès** : `ANALYSTE_SIG` (imports/matching), `ADMIN`/`SUPER_ADMIN` (écritures), `SUPER_ADMIN` (utilisateurs, configurations, suppression) — contrôlés par middleware **et** dans les services.
- **Logs Pino** avec **redaction** des champs sensibles (tokens, mots de passe, headers d'auth).
- **IA** : politique de sûreté Gemini, limite de débit par utilisateur, vue des conversations super-admin optionnelle.
- **Migrations non destructives** (aucune suppression sur les données de référence).
- **Système** : `/system/database-status` désactivé en production (403).

## 23. Docker

Le projet est conteneurisé (voir [`docs/deployment.md`](docs/deployment.md)).

**Image de production** (`Dockerfile`, multi-stage, `node:20-alpine`) : build TypeScript → exécution avec `npm ci --omit=dev`, dossiers `uploads/imports` et `uploads/reports` créés, `EXPOSE 5000`, **HEALTHCHECK** sur `/health`.

**Stack éphémère complète** (`docker-compose.yml`, profil `db`) :

```bash
cp .env.example .env        # renseigner au minimum JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
docker compose --profile db up --build
docker compose --profile db run --rm migrate   # applique les migrations SQL
docker compose --profile db run --rm seed      # (optionnel) comptes de démo + source météo
```

- Services : `api` (port 5000, healthcheck `GET /health`) + `db` (PostgreSQL 16 + PostGIS 3.4, **dans un profil dédié, sans aucun port publié sur l'hôte**) + `migrate` / `seed` (one-shot).
- La base du conteneur vit dans le volume dédié `pgdata` et part de zéro ; l'API pointe par défaut sur `db` via `DATABASE_URL` (par interpolation : `postgres://postgres:postgres@db:5432/mada_risk`).
- Toutes les variables de l'application sont fournies par le montage en lecture seule de `.env` dans le conteneur.

**Garantie « ne touche pas la base locale »** : le conteneur `db` n'utilise **ni le port `5432` de l'hôte, ni vos données locales** — tout est isolé dans le volume `pgdata`. Une base locale `mada_risk` (ex. vos **119 districts / 1579 communes**) n'est jamais atteinte.

**Utiliser une base existante** : ne pas activer le profil `db` et faire pointer l'API sur la base souhaitée :

```bash
docker compose up --build          # API seule, profil db non activé
# .env → DATABASE_URL=postgres://user:pass@host.docker.internal:5432/mada_risk
```

Les migrations étant **non destructives**, elles peuvent être appliquées à cette base sans impact sur les données réelles (`docker compose run --rm migrate` en adaptant `DATABASE_URL` via une commande explicite).

## 24. Tests

- **Vitest** (`vitest.config.ts`) : `tests/unit` + `tests/integration`.
- Les tests d'intégration utilisent **Supertest** contre l'application Express + une base de données réelle (fixtures dans `tests/fixtures`).
- `npm test` : exécution séquentielle (parallélisme désactivé) — ~13 fichiers, **168 tests**.
- `npm run test:coverage` : couverture v8 sur `src/**/*.ts` (rapport textuel + HTML dans `coverage/`).
- Contrôles de qualité avant livraison : `npm run lint`, `npm run format:check`, `npm run typecheck:test`, `npm test`, `npm run db:check`.

### Fonctionnalités futures (hors périmètre actuel)

Cette phase de finalisation n'inclut **pas** :
- **Socket.IO** (notification temps réel aux postes de commande),
- **Notifications SMS** vers les populations,
- **Import de Shapefile ZIP** (actuellement GeoJSON/JSON/CSV),
- **Modèle ML prédictif avancé** (le risque repose sur un moteur pondéré configurable, non sur un modèle entraîné).

---

## Licence

Projet interne **MadaRisk Map**.