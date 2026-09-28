# Mode démonstration (soutenance)

Le mode démonstration fournit un environnement **strictement isolé** de la base
opérationnelle, destiné à présenter MadaRisk Map lors de la soutenance. Il
rejoue un scénario cyclonique simulé (cyclone Ankaratra) à travers quatre
étapes, sans aucun appel externe et sans jamais toucher à la base réelle.

## 1. Principe

- Le mode normal reste **totalement inchangé** (même base, mêmes ports, mêmes
  variables `backend/.env` et `frontend/.env`).
- Le mode démo utilise une base dédiée dont le nom se termine par `_demo`
  (`mada_risk_demo`), un port backend dédié (5001) et un port frontend dédié
  (5174).
- Toutes les données produites sont marquées comme simulées (`SIMULÉ`), jamais
  comme des données opérationnelles.

## 2. Garanties de sécurité

- Un garde unique (`assertDemoDatabase`) refuse toute base qui ne se termine pas
  exactement par `_demo` et qui s'appelle `mada_risk`, **avant toute requête
  SQL**. Une erreur claire est affichée et le script s'arrête.
- Au démarrage, `backend/src/config/env.ts` valide la cohérence du mode démo
  (`NODE_ENV=demo`, `DEMO_MODE=true`, `ENABLE_SCHEDULED_JOBS=false`, base
  suffixée `_demo`) et refuse de démarrer sinon.
- Les tâches planifiées (crons météo, recalcul des risques, ingestion DGM) sont
  désactivées en mode démo (`ENABLE_SCHEDULED_JOBS=false`).
- Aucun appel réseau externe : `OPEN_METEO_BASE_URL` et
  `DGM_MAPROOM_BASE_URL` pointent vers `http://127.0.0.1:9` (port non routable).
- Les routes `/api/v1/demo/*` répondent **404** hors mode démonstration, comme
  si elles n'existaient pas.
- Les scripts démo n'ont pas le droit de créer, modifier ou supprimer des
  migrations ; le schéma est strictement identique à la production.

## 3. Périmètre exclu

- Aucune donnée de victimes, décès, blessés ou dégâts matériels n'est générée
  ni affichée.
- Aucune modification des rôles, permissions ou guards d'autorisation.
- Le mode démo ne crée pas de nouveau schéma ni de nouvelle migration.

## 4. Prérequis

- PostgreSQL 16 + PostGIS accessibles localement.
- Un dump de la géographie (régions / districts / communes) **externe au
  dépôt** : le référentiel administratif (119 districts, 1 579 communes) n'est
  pas versionné.
- Fichiers `backend/.env.demo` et `frontend/.env.demo` (voir les
  `.env.demo.example`).

## 5. Commandes backend

```bash
cd backend
npm run demo:dev            # démarre l'API démo (NODE_ENV=demo, port 5001)

npm run db:demo:create      # crée la base mada_risk_demo
npm run db:demo:migrate     # applique les migrations (runMigrations)
npm run db:demo:init        # importe la géographie ciblée (dump externe)
npm run db:demo:seed        # construit le scénario (étape 1)
npm run db:demo:reset       # supprime puis reconstruit le scénario
npm run db:demo:dump        # exporte la base démo (database/demo-dumps)
npm run db:demo:restore     # restaure la base démo depuis un dump
```

L'import géographique utilise `DEMO_GEOGRAPHY_DUMP` ou l'argument `--file=`.
L'export/restauration utilisent `DEMO_DUMP_FILE` (défaut
`database/demo-dumps/mada_risk_demo.dump`).

## 6. Commandes frontend

```bash
cd frontend
npm run dev:demo            # Vite en mode demo (port 5174, proxy -> 5001)
npm run build:demo          # build en mode demo
```

## 7. Scénario de démonstration

Scénario : `SCÉNARIO DE DÉMONSTRATION — Cyclone Ankaratra`
(code `DEMO-CYC-ANKARATRA`).

| Étape | Libellé | Contenu simulé |
| --- | --- | --- |
| 1 | Prévision | Trajectoire prévue, zone d'influence simulée, communes exposées, risques, alerte préventive (brouillon) |
| 2 | Événement actif | Trajectoire observée, mise à jour de l'exposition et des risques, alerte active |
| 3 | Suivi | Points observés supplémentaires, zones et risques mis à jour |
| 4 | Bilan et clôture | Événement clôturé, alertes archivées, bilan disponible |

Chaque étape est **cumulative et idempotente** : demander une étape antérieure
reconstruit le scénario de manière déterministe.

## 8. API de démonstration

Disponibles uniquement en mode démo (404 sinon), accessibles à ADMIN et
SUPER_ADMIN :

- `GET  /api/v1/demo/scenario` — étape courante, événement simulé, compteurs.
- `POST /api/v1/demo/step` — corps `{ "step": "PREVISION|ACTIF|SUIVI|CLOTURE" }`.
- `POST /api/v1/demo/reset` — réinitialise et reconstruit l'étape 1.

## 9. Variables d'environnement (backend `.env.demo`)

| Variable | Valeur démo |
| --- | --- |
| `NODE_ENV` | `demo` |
| `DEMO_MODE` | `true` |
| `PORT` | `5001` |
| `DATABASE_URL` | `...@localhost:5432/mada_risk_demo` |
| `FRONTEND_URL` | `http://localhost:5174` |
| `ENABLE_SCHEDULED_JOBS` | `false` |
| `ALERTS_AUTO_PUBLISH` | `false` |
| `OPEN_METEO_BASE_URL` | `http://127.0.0.1:9` |
| `DGM_MAPROOM_BASE_URL` | `http://127.0.0.1:9` |
| `REPORTS_DIR` | `uploads/demo/reports` |
| `IMPORTS_DIR` | `uploads/demo/imports` |

Géographie ciblée : `DEMO_REGION_NAME` (défaut `VAKINANKARATRA`),
`DEMO_DISTRICT_NAMES` (défaut `ANTSIRABE I,ANTSIRABE II,AMBATOLAMPY`). Une
absence est signalée par une erreur claire (pas de substitution silencieuse).

## 10. Variables d'environnement (frontend `.env.demo`)

| Variable | Valeur démo |
| --- | --- |
| `VITE_API_URL` | `/api/v1` |
| `VITE_API_PROXY_TARGET` | `http://localhost:5001` |
| `VITE_APP_NAME` | `MadaRisk Map — DÉMONSTRATION` |
| `VITE_DEMO_MODE` | `true` |

## 11. Signalisation dans l'interface

- Une bannière sticky « MODE DÉMONSTRATION » est affichée sur toutes les pages,
  y compris la connexion (`DemoBanner`).
- Un panneau « Scénario de soutenance » (`ScenarioPanel`) permet de changer
  d'étape ou de réinitialiser, réservé aux rôles ADMIN / SUPER_ADMIN, avec une
  confirmation explicite (réinitialisation en variante destructive).
- Les données simulées portent un badge `SIMULÉ` (événements, détail, bilan,
  alertes, zones/comptes exposés). Les libellés de trajectoire utilisent
  `PRÉVISION SIMULÉE` / `OBSERVATION SIMULÉE`.

## 12. Marquage des données simulées

- Source de l'événement : `SCÉNARIO SOUTENANCE — SIMULÉ` /
  `simulation://soutenance`.
- Historique de statut : `actor_type = SYSTEM`, source
  `SIMULATION_SOUTENANCE` (jamais `USER` / `MANUAL_UI`).
- Zones d'influence et communes exposées marquées comme simulées.
- Les alertes conservent la source de l'événement pour permettre le badge.

## 13. Réinitialisation et sauvegarde

- `npm run db:demo:reset` : supprime puis reconstruit le scénario simulé.
- `npm run db:demo:dump` / `npm run db:demo:restore` : permettent de figer un
  état de démonstration et de le restaurer rapidement avant la soutenance.
- Aucun script démo ne peut viser une base non suffixée `_demo`.

## 14. Vérifications

```bash
cd backend && npm run lint && npm run typecheck && npm test
cd frontend && npm run lint && npm run build && npm test
```

Le test unitaire `tests/unit/demo-mode.test.ts` couvre le garde de base et la
validation d'environnement. Le test d'intégration `tests/integration/demo.test.ts`
vérifie que les routes démo répondent 404 hors mode démonstration.

## 15. Limites connues

- L'import de la géographie dépend d'un dump externe non versionné.
- Les tests d'intégration nécessitent une base PostgreSQL accessible ; les tests
  dépendant de `mada_risk_demo` exigent que la base démo soit migrée et peuplée.
- Le scénario météo est entièrement synthétique : les valeurs ne représentent pas
  une prévision réelle.
