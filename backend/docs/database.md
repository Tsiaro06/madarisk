# Base de données

Guide de la persistance **PostgreSQL 16 + PostGIS 3.4** du backend MadaRisk Map.

## Chaîne de connexion

Priorité à `DATABASE_URL` ; à défaut, composants `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL`.

| Variable | Défaut |
|---|---|
| `DATABASE_URL` | — (ex. `postgres://user:pass@localhost:5432/mada_risk?sslmode=require`) |
| `DB_HOST` | `localhost` |
| `DB_PORT` | `5432` |
| `DB_NAME` | `mada_risk` |
| `DB_USER` | `postgres` |
| `DB_PASSWORD` | `postgres` |
| `DB_SSL` | `false` |

## Migrations

- Fichiers SQL numérotés `001_*.sql` → `011_*.sql` dans `database/migrations/`.
- Exécution : `npm run db:migrate` (script `database/scripts/migrate.ts`), traçage dans la table `_migrations` (verrou et tri par ordre).
- **Non destructives** : aucune suppression (`DROP`, `TRUNCATE`, `DELETE`) sur les tables de référence.
- Diagnostique : `npm run db:check` → connexion, version PostgreSQL, présence PostGIS, comptage des districts et communes.

## Schéma principal (aperçu)

| Domaine | Tables représentatives |
|---|---|
| Identité & sécurité | `users`, `sessions`, `audit_logs`, `metadata` |
| Organisation | `organizations`, `organization_members` |
| Référentiel territorial | `districts`, `communes` (géométries PostGIS, population, ménages, vulnérabilité) |
| Import / matching | `imports`, `import_records`, `matching_candidates`, `aliases` |
| Événements | `events`, `event_tracks`, `event_influence_areas`, `event_exposures`, `event_communes` |
| Météo | `weather_observations`, `weather_forecasts` |
| Risque | `risk_evaluations`, `risk_configurations` |
| Alertes | `alerts` |
| Rapports | `reports` |
| Assistant IA | `ai_conversations`, `ai_messages` |

> La liste exacte des tables et colonnes est générée par les migrations : voir `database/migrations/`. Les identifiants sont des **UUID v4**.

## PostGIS & géométries

- Extension requise : `postgis` (login sur la base).
- Géométries stockées en `GEOMETRY` (MultiPolygon / Point) référencement `EPSG:4326` (WGS 84) ; sérialisées en **GeoJSON** (`ST_AsGeoJSON`) pour les couches Leaflet.
- Fonctions et vues utiles : centroïdes de districts/communes, agrégats de risque par commune, cercles d'influence (`ST_Buffer`), distances (`ST_DWithin`), exposition (population/ménages interceptés).

## Référentiel des données réelles

- **119 districts**, **1579 communes** de Madagascar (population, ménages, géométries).
- Ce référentiel est chargé à partir des fichiers SIG réels, **hors migrations** (voir `database/seeds/` et les scripts de chargement dédiés).
- Après `db:seed`, la base contient également : l'organisation **MadaRisk Organisation**, une **configuration de risque par défaut**, la source **Open-Meteo**, et (si `users` vide) les comptes de démonstration (`admin@madarisk.mg` / `Admin@123!`, `operator@madarisk.mg` / `Operator@123!`).

## Performances & transactions

- Pool `node-postgres` partagé (`src/config/database.ts`), `healthCheck()` = `SELECT 1` + vérification PostGIS.
- Services : transactions explicites (`BEGIN/COMMIT/ROLLBACK`) sur les opérations multi-étapes (ex. import + matching, calculs d'exposition).
- Requêtes paramétrées dans les repositories (`src/repositories/*`).

## Compatibilité Docker

Le service `db` (docker-compose) est **isolé dans un volume dédié** (`pgdata`), **n'utilise pas le port `5432` de l'hôte** et n'est actif que via le profil `db` (`docker compose --profile db up`). Il ne peut donc pas écraser une base locale `mada_risk`. Migration et seed se font via les services one-shot `migrate` et `seed`. Pour brancher l'API sur une base existante (ex. celle contenant les 119 districts / 1579 communes), ne pas activer le profil `db` et renseigner `DATABASE_URL` vers cette base (les migrations restent applicables car non destructives).

Voir [`deployment.md`](deployment.md).