# Rapport Phase E2 — Implémentation du mode démonstration (soutenance)

Date : 17 septembre 2026
Périmètre : **implémentation** du mode démonstration isolé (Option A) — backend,
scripts de base de données, API, frontend et tests. Aucune migration de schéma,
aucune modification de la base opérationnelle, aucun commit Git.
Objet : permettre une démonstration sans risque (« SCÉNARIO DE DÉMONSTRATION —
Cyclone Ankaratra ») strictement isolée des données réelles.

> Ce rapport remplace le rapport d'analyse de la Phase E1 (supprimé).

---

## 0. Synthèse

- **Option A retenue** : base dédiée `mada_risk_demo`, backend démo (port
  `5001`), frontend démo (port `5174`). Le mode normal est **inchangé**.
- Isolation garantie par un garde de base unique (suffixe `_demo` obligatoire),
  par la validation stricte de `NODE_ENV=demo`/`DEMO_MODE=true` au démarrage et
  par la désactivation totale des jobs et des appels externes.
- Scénario rejouable en 4 étapes (Prévision → Actif → Suivi → Clôture),
  déterministe et idempotent, généré en réutilisant les services métier
  existants (exposition, risques, alertes) — pas de scores insérés à la main.
- Signalisation systématique : bannière globale, panneau de pilotage réservé aux
  ADMIN/SUPER_ADMIN, badges `SIMULÉ`.
- **Vérifications vertes** : backend lint + typecheck + format + 323 tests ;
  frontend lint + build + 80 tests.

---

## 1. Backend — configuration et garde d'isolation

### 1.1 Chargement d'environnement (`backend/src/config/env.ts`)

- Le mode démo est demandé au démarrage via `NODE_ENV=demo`. Dans ce cas
  uniquement, `.env.demo` est chargé ; sinon le comportement reste strictement
  inchangé (`.env`).
- `NODE_ENV` accepte désormais `demo` : `['development','production','test','demo']`.
- Nouvelle variable `DEMO_MODE` (booléenne, défaut `false`).
- Helpers exportés, sans jamais exposer les identifiants :
  - `resolveDatabaseName({ databaseUrl, dbName })`
  - `isDemoDatabaseName(name)` — suffixe exact `_demo`, refus de `mada_risk`
  - `DEMO_DATABASE_SUFFIX = '_demo'`
  - `demoEnvironmentIssues(data)` — liste les incohérences bloquantes
- **Validation bloquante** : en `DEMO_MODE=true`, l'API refuse de démarrer si
  `NODE_ENV != 'demo'`, si `ENABLE_SCHEDULED_JOBS != false` ou si la base cible
  n'est pas suffixée `_demo` (`process.exit(1)` + message explicite).

### 1.2 Démarrage (`backend/src/server.ts`)

- Bannière `DEMO_BANNER` affichée si `DEMO_MODE`.
- Les jobs planifiés (météo, recalcul des risques, ingestion DGM) ne sont lancés
  **que** si `!env.DEMO_MODE`.
- Message de journalisation : « Mode démonstration : jobs planifiés et appels
  externes neutralisés. »

### 1.3 Logs (`backend/src/config/logger.ts`)

- Le transport lisible « pretty » est également appliqué à `NODE_ENV=demo`.

### 1.4 Garde des scripts (`backend/database/scripts/demo/assert-demo-db.ts`)

- Garde unique appelé **avant toute connexion SQL** par tous les scripts démo.
- `isAllowedDemoDatabase(name)` : nom non vide, différent de `mada_risk`, et se
  terminant exactement par `_demo`.
- `assertDemoDatabase(input)` : lève `DemoDatabaseSecurityError` sinon.
- `assertDemoDatabaseOrExit(input)` : variante CLI qui affiche une erreur claire,
  rappelle qu'aucune requête SQL n'a été exécutée, puis `exit(1)`.
- Le nom de base retourné n'affiche jamais les identifiants.

---

## 2. Backend — scripts de base de données démo

Refactorisations minimales pour la réutilisation :

- `database/scripts/migrate.ts` expose `runMigrations()` et ne s'auto-exécute
  plus que s'il est appelé directement (`isDirectInvocation()`).
- `database/scripts/seed.ts` expose `runBaseSeed()` et ne s'auto-exécute plus que
  s'il est appelé directement.

Nouveaux scripts (`backend/database/scripts/demo/`) :

| Script | Rôle |
| --- | --- |
| `demo-env.ts` | chargement du contexte démo + fabriques de pools (contexte et maintenance) |
| `create-demo-db.ts` | crée la base `mada_risk_demo` (jamais `mada_risk`) |
| `migrate-demo.ts` | applique les migrations via `runMigrations()` |
| `init-demo-geography.ts` | importe la géographie ciblée depuis un dump externe |
| `seed-scenario.ts` | construit le scénario (étape 1) |
| `reset-demo.ts` | supprime puis reconstruit le scénario (confirmation requise) |
| `dump-demo.ts` | exporte la base démo (`database/demo-dumps/`) |
| `restore-demo.ts` | restaure la base démo depuis un dump |
| `dev-demo.ts` | démarre l'API démo (`NODE_ENV=demo`) |

Scripts npm ajoutés : `demo:dev`, `db:demo:create`, `db:demo:migrate`,
`db:demo:init`, `db:demo:seed`, `db:demo:reset`, `db:demo:dump`,
`db:demo:restore`.

Points de sécurité :

- `reset-demo.ts` exige la confirmation exacte `SUPPRIMER mada_risk_demo`, sinon
  l'opération est annulée.
- L'import géographique utilise `DEMO_GEOGRAPHY_DUMP` ou `--file=` ; l'absence de
  géographie déclenche une erreur claire (aucune substitution silencieuse).
- Dumps : `DEMO_DUMP_FILE` (défaut `database/demo-dumps/mada_risk_demo.dump`).
- `.gitignore` backend complété : `.env.demo`, `database/demo-dumps/`.

---

## 3. Backend — API de démonstration

- `src/middlewares/demo-mode.middleware.ts` : `requireDemoMode` répond **404**
  (« route non trouvée ») si `DEMO_MODE` est inactif ou si la base cible n'est
  pas une base `_demo`.
- `src/validators/demo.validator.ts` : corps `{ step }` contraint à
  `PREVISION|ACTIF|SUIVI|CLOTURE`.
- `src/controllers/demo.controller.ts` : `getScenario`, `setStep`, `reset`.
- `src/routes/demo.routes.ts` : middleware `requireDemoMode` → `authenticate` →
  `authorize('ADMIN','SUPER_ADMIN')`.
- `src/routes/index.ts` : montage de `demoRoutes` sous `/demo`.

Endpoints exposés (`/api/v1/demo/*`) :

| Méthode | Route | Description |
| --- | --- | --- |
| GET | `/demo/scenario` | étape courante, événement simulé, compteurs |
| POST | `/demo/step` | applique une étape (reconstruction si antérieure) |
| POST | `/demo/reset` | reconstruit le scénario à l'étape 1 |

---

## 4. Backend — scénario de démonstration

`src/services/demo-scenario.service.ts` :

- Constantes : `DEMO_EVENT_CODE='DEMO-CYC-ANKARATRA'`,
  `DEMO_SOURCE_NAME='SCÉNARIO SOUTENANCE — SIMULÉ'`,
  `DEMO_SOURCE_URL='simulation://soutenance'`,
  `DEMO_HISTORY_SOURCE='SIMULATION_SOUTENANCE'`.
- `DEMO_STEPS` : les 4 étapes avec libellés et descriptions.
- `assertDemoRuntime()` : re-vérifie à l'exécution `DEMO_MODE` **et** un nom de
  base `_demo`, sinon 404.
- Géographie ciblée : `DEMO_REGION_NAME` (défaut `VAKINANKARATRA`),
  `DEMO_DISTRICT_NAMES` (défaut `ANTSIRABE I,ANTSIRABE II,AMBATOLAMPY`).
- Construction : trajectoire prévue puis observée, communes de détection, zones
  d'influence, prévisions/observations simulées (source `SIMULATION SOUTENANCE`),
  puis **réutilisation des services existants** :
  - `exposureService.computeForEvent(eventId, { trigger: 'MANUAL' })`
  - `automaticAlertService.generateForEvent({ ..., autoPublish: false })`
- Marquage simulé : `markEventDataAsSimulated` (zones, communes exposées) et
  historiques de statut avec `actor_type = SYSTEM` et source
  `SIMULATION_SOUTENANCE` (jamais `USER`/`MANUAL_UI`).
- Étapes cumulatives : `applyPrevisionStep`, `applyActifStep`, `applySuiviStep`,
  `applyClotureStep` (clôture → archivage des alertes).
- `demoScenarioService` : `reset()`, `seed()` (alias idempotent), `goToStep(step)`
  (reconstruit si l'étape demandée est antérieure), `getState()`.

---

## 5. Frontend — configuration démo

- `frontend/vite.config.ts` réécrit sous forme de fonction `({ mode })` avec
  `loadEnv` : port `5174` en mode `demo`, proxy piloté par
  `VITE_API_PROXY_TARGET` (défaut `http://localhost:5000`, `5001` en démo).
- Scripts npm : `dev:demo` (`vite --mode demo`), `build:demo`.
- `frontend/.env.demo` et `.env.demo.example` :
  `VITE_API_URL=/api/v1`, `VITE_API_PROXY_TARGET=http://localhost:5001`,
  `VITE_APP_NAME=MadaRisk Map — DÉMONSTRATION`, `VITE_DEMO_MODE=true`.
- `.gitignore` frontend complété : `.env.demo`.
- `src/config/demo.ts` : `DEMO_MODE`, `DEMO_EVENT_CODE`, `DEMO_EVENT_NAME`,
  `DEMO_STEP_LABELS`, `DEMO_STEP_ORDER`, `isSimulatedSource`, `isSimulatedEvent`.
- `src/types/demo.ts` : `DemoStep`, `DemoStepInfo`, `DemoScenarioEvent`,
  `DemoScenarioCounts`, `DemoScenarioState`.
- `src/api/index.ts` : `demoApi.scenario()`, `demoApi.setStep(step)`,
  `demoApi.reset()` (via le client XHR unique `src/api/client.ts`).

---

## 6. Frontend — interface de démonstration

- `src/components/demo/DemoBanner.tsx` : bannière sticky « MODE DÉMONSTRATION —
  Données simulées pour la soutenance », montée dans `App.tsx` avant
  `AuthBootstrap` (visible aussi sur la page de connexion).
- `src/components/demo/ScenarioPanel.tsx` : panneau flottant « Scénario de
  soutenance » monté dans `App.tsx`, affiché uniquement si `VITE_DEMO_MODE=true`
  **et** rôle ADMIN/SUPER_ADMIN. Boutons d'étape (variante `warning`) et
  réinitialisation (variante `destructive`) passant par
  `AdministrativeActionConfirmDialog` ; après succès, invalidation TanStack Query
  des domaines concernés (`demo`, `events`, `event`, `alerts`, `dashboard`,
  `crisis`, `risks`, `weather`).
- `src/components/demo/SimulatedBadge.tsx` : badge `SIMULÉ` (tone `warning`).
- Intégration des badges : `EvenementsPage` (liste), `EventBilanTab` (source),
  `AlertesPage` (source de l'alerte). Ajout de `source?: string | null` au type
  `AlertListRow` pour permettre le marquage des alertes.

---

## 7. Documentation OpenAPI

`backend/src/docs/openapi.yaml` :

- Nouveau tag « Démonstration » explicitement marqué « DÉMO UNIQUEMENT », avec la
  mention du 404 hors mode démo et la restriction ADMIN/SUPER_ADMIN.
- Documentation des routes `/demo/scenario`, `/demo/step`, `/demo/reset`.

---

## 8. Documentation opérationnelle

- `docs/demo-mode.md` : principe, garanties de sécurité, périmètre exclu,
  prérequis, commandes backend/frontend, étapes du scénario, API, variables
  d'environnement, signalisation UI, marquage des données, réinitialisation et
  sauvegarde, vérifications, limites connues.

---

## 9. Tests

Backend :

- `tests/unit/demo-mode.test.ts` (17 tests) : `resolveDatabaseName`,
  `isDemoDatabaseName`, `demoEnvironmentIssues`, `assertDemoDatabase`
  (acceptation `_demo`, refus de `mada_risk`, non-divulgation des identifiants),
  `requireDemoMode` (404 hors démo), ordre et libellés des étapes.
- `tests/integration/demo.test.ts` (3 tests) : les trois routes `/demo/*`
  répondent 404 hors mode démonstration.

Frontend :

- `src/components/demo/DemoBanner.test.tsx` (2 tests) : invisible hors mode démo,
  contenu non opérationnel en mode démo.
- `src/components/demo/ScenarioPanel.test.tsx` (8 tests) : gating rôles, gating
  `VITE_DEMO_MODE`, affichage de l'étape et des compteurs, confirmation sans
  appel API, annulation sans requête, confirmation = 1 requête, réinitialisation
  destructive.

---

## 10. Vérifications exécutées

| Commande | Résultat |
| --- | --- |
| `backend` `npm run lint` (eslint, `--max-warnings 0`) | OK |
| `backend` `npm run typecheck` (`tsc --noEmit`) | OK |
| `backend` `npm run format:check` (prettier) | OK |
| `backend` `npm test` (vitest) | **26 fichiers, 323 tests — tous verts** |
| `frontend` `npm run lint` (oxlint) | OK (uniquement des avertissements préexistants) |
| `frontend` `npm run build` (`tsc -b && vite build`) | OK |
| `frontend` `npm test` (vitest) | **11 fichiers, 80 tests — tous verts** |

Corrections apportées pendant la vérification :

- Paramètre inutilisé supprimé dans `demo-scenario.service.ts` (exigence
  `noUnusedParameters`).
- Comparaisons `== null` remplacées par des comparaisons strictes (`eqeqeq`).
- Contrôleurs référencés via des fonctions fléchées dans `demo.routes.ts`
  (`@typescript-eslint/unbound-method`).
- Mise au format Prettier de 4 fichiers backend.

---

## 11. Garanties de sécurité respectées

- Aucune connexion en écriture à `mada_risk` depuis un script démo ; garde
  `assertDemoDatabase` avant toute requête SQL.
- Aucune modification de `backend/.env` ni `frontend/.env`.
- Aucune création/modification/suppression de migration.
- Aucun `DROP DATABASE` possible sur une base non suffixée `_demo` ; la
  réinitialisation exige la confirmation `SUPPRIMER mada_risk_demo`.
- Aucun appel externe : URL Open-Meteo et DGM forcées vers `http://127.0.0.1:9`,
  jobs planifiés désactivés.
- Aucune donnée de victimes/décès/blessés/dégâts.
- Aucune modification des rôles, permissions ou guards.
- Toutes les données de démonstration sont explicitement marquées `SIMULÉ`.
- Aucun commit Git.

---

## 12. Fichiers principaux créés / modifiés

Backend (créés) : `database/scripts/demo/{assert-demo-db,demo-env,create-demo-db,
migrate-demo,init-demo-geography,seed-scenario,reset-demo,dump-demo,restore-demo,
dev-demo}.ts`, `src/services/demo-scenario.service.ts`,
`src/middlewares/demo-mode.middleware.ts`, `src/validators/demo.validator.ts`,
`src/controllers/demo.controller.ts`, `src/routes/demo.routes.ts`,
`tests/unit/demo-mode.test.ts`, `tests/integration/demo.test.ts`,
`.env.demo`, `.env.demo.example`.

Backend (modifiés) : `src/config/env.ts`, `src/config/logger.ts`,
`src/server.ts`, `src/routes/index.ts`, `src/docs/openapi.yaml`,
`database/scripts/migrate.ts`, `database/scripts/seed.ts`, `package.json`,
`.gitignore`.

Frontend (créés) : `src/components/demo/{DemoBanner,ScenarioPanel,
SimulatedBadge}.tsx` et leurs tests, `src/config/demo.ts`, `src/types/demo.ts`,
`.env.demo`, `.env.demo.example`.

Frontend (modifiés) : `vite.config.ts`, `package.json`, `.gitignore`,
`src/App.tsx`, `src/api/index.ts`, `src/types/index.ts`, `src/pages/
EvenementsPage.tsx`, `src/pages/AlertesPage.tsx`,
`src/components/events/EventBilanTab.tsx`.

Documentation : `docs/demo-mode.md` (nouveau).

---

## 13. Non exécuté / points de vigilance

- **Non exécuté volontairement** (nécessite une confirmation explicite et un dump
  géographique externe) : `db:demo:create`, `db:demo:migrate`, `db:demo:init`,
  `db:demo:seed`, `db:demo:reset`, `db:demo:dump`, `db:demo:restore`, ainsi que le
  démarrage réel `npm run demo:dev` / `npm run dev:demo`.
- Le référentiel géographique (119 districts / 1 579 communes) n'est pas dans le
  dépôt : l'import du dump est le prérequis de préparation avant la soutenance.
- Les tests backend d'intégration s'exécutent sur une base PostgreSQL réelle ;
  les tests spécifiques à `mada_risk_demo` exigeraient la base démo migrée et
  peuplée.
- Le scénario météo est entièrement synthétique : il ne représente pas une
  prévision réelle.
