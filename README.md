# MadaRisk Map

Plateforme SIG de surveillance et d'anticipation des catastrophes naturelles à Madagascar.

## Vue d'ensemble

MadaRisk Map agrège les données territoriales (119 districts, 1579 communes), les événements cycloniques et leurs trajectoires, les données météo (Open-Meteo), puis calcule un score de risque par commune. Il publie des alertes, alimente un tableau de bord et génère des rapports. Un assistant IA répond aux questions de renseignement sur la situation en cours.

## Structure du projet

- `backend/` — Express + TypeScript REST API (PostgreSQL 16 + PostGIS), port 5000 sous `/api/v1`, Swagger à `/api/docs`
- `frontend/` — React 19 + Vite + Tailwind v4 SPA, port 5173
- `database/` — Migrations et scripts SQL
- `docs/` — Documentation technique

## Démarrage rapide

### Backend
```bash
cd backend
cp .env.example .env  # configurer les variables (JWT secrets requis)
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

L'API sera disponible sur `http://localhost:5000`, le frontend sur `http://localhost:5173`.

## Comptes de démonstration
Après `npm run db:seed` (backend) :
| Rôle | Email | Mot de passe |
|---|---|---|
| SUPER_ADMIN | `admin@madarisk.mg` | `Admin@123!` |
| ADMIN | `operator@madarisk.mg` | `Operator@123!` |

## Commandes utiles

### Backend
- `npm run dev` — Serveur de développement
- `npm run lint` — ESLint (`--max-warnings 0`)
- `npm run typecheck` — Vérification TypeScript
- `npm test` — Tests Vitest
- `npm run db:migrate` / `npm run db:seed` — Migrations et seeds

### Frontend
- `npm run dev` — Serveur Vite
- `npm run build` — Build production (tsc + vite)
- `npm run lint` — Oxlint
- `npm test` — Tests Vitest

## Documentation
- [Backend README](backend/README.md) — Documentation détaillée du backend
- [Documentation technique](docs/) — Architecture, base de données, API, moteur de risque
- [Swagger UI](http://localhost:5000/api/docs) — Documentation API interactive

## Licence
Projet interne MadaRisk Map.
