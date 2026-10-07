# Plan : détection automatique + alertes automatiques fonctionnelles en temps réel

## Objectif
Que la chaîne ingestion → détection → événement → alerte auto-publiée → UI temps réel fonctionne de bout en bout.

Décisions validées par l'utilisateur : auto-publication des alertes (`ALERTS_AUTO_PUBLISH=true`), temps réel via **SSE + TanStack Query** (aucun canal externe), règles de détection via **API CRUD + seed**. Seuils seed validés : **rafales > 90 km/h** (relevé de 70 à 90 le 2026-10-07 pour ne détecter que du vent cyclonique), **pluie > 50 mm/24h**.

## État des lieux (vérifié)
- 0 règle en base, aucun endpoint d'écriture (schemas Zod déjà prêts, morts) → détection sautée silencieusement (`hazard-detection.service.ts:81`, skip non enregistré car `createRun` non appelé et enum `automation_run_status` sans `SKIPPED`).
- `POST /weather/refresh/communes` (seul appel de l'UI) ne déclenche jamais `detectAfterSync` (privé à `weather-sync.service.ts:612`, appelé seulement à `:676`).
- `ALERTS_AUTO_PUBLISH` absent de `backend/.env` → alertes auto toujours BROUILLON (0 PUBLIEE en base).
- Aucun temps réel : ni SSE/WS côté backend, ni listener côté frontend.
- Backend liste alerts retourne déjà `basis`/`is_automatic` + filtre query `automatic`/`basis` (repository L128-136, L263-268 ; validator `alerts.validator.ts:91,97`) — le frontend ne les exploite pas (`AlertListRow` sans ces champs).
- 24 tests frontend en échec (sélecteur `/Intervention administrative/` obsolète après ajout du prop `title`).

---

## Backend (`D:\MadaRisk\backend`)

### B1. CRUD règles de détection (SUPER_ADMIN)
- `src/repositories/detection-rules.repository.ts` : ajouter `createRule(input, actorId)`, `updateRule(id, input)`, `deleteRule(id)` (RETURNING, colonnes de `012_automation_rules_history.sql:20-54`).
- `src/services/detection-rules.service.ts` : `createRule`, `updateRule` (404 via `AppError.notFound` si absent), `deleteRule`.
- `src/controllers/detection-rules.controller.ts` : handlers `createRule` / `updateRule` / `deleteRule` (pattern `req.validatedBody`).
- `src/routes/detection-rules.routes.ts` : `POST /` + `PATCH /:id` + `DELETE /:id` avec `validate({ body: createDetectionRuleSchema|updateDetectionRuleSchema, params: detectionRuleIdParamsSchema })` (router déjà `authorize('SUPER_ADMIN')`, cf. pattern `risk-configurations.routes.ts:25-37`).
- Tests : étendre `tests/integration/detection-rules.test.ts` (403 CLIENT, 422 corps invalide, 200 create/vérif champs, PATCH, DELETE, 404).

### B2. Seed de règles par défaut
- `database/scripts/seed.ts` : nouvelle section idempotente (garde `WHERE NOT EXISTS` sur metric+hazard_type, dans la transaction existante, pattern section 2 L42-56) avec ~4 règles nationales (aucun scope géo) en s'appuyant sur les alias de `src/services/detection.logic.ts:5-55` :
  - `CYCLONE` / `wind_gusts` / GT / **90 km/h** (horizon 0 = observations ; seuil relevé de 70 à 90 le 2026-10-07)
  - `FORTE_PLUIE` / `rainfall` / GT / **50 mm/24h**
  - `VENT_VIOLENT` / `wind` / GT / 60 km/h
  - `VAGUE_DE_CHALEUR` / `temperature` / GE / 40 °C (forecast horizon 48 ; seuil relevé de 35 à 40 le 2026-10-07)
  - `severityRules` calés sur la logique d'évaluation (vérifier `evaluateRules`/`detection.logic.ts:81-197` avant de fixer les min).
- Exécuter `npm run db:migrate` puis `npm run db:seed` sur la base dev.

### B3. Détection après le refresh legacy (chemin UI)
- `src/services/weather-sync.service.ts` : **exporter** `detectAfterSync` (L612) et paramétrer le `trigger` (`'SCHEDULED' | 'MANUAL'`).
- `src/services/weather.service.ts` : appeler `detectAfterSync('OBSERVATIONS', 'MANUAL')` en fin de `refresh()` (~L339), try/catch + `logger.warn` — couvre à la fois le chemin synchrone (district/commune) et le fond national. Pas de cycle d'import (weather-sync n'importe pas weather.service).

### B4. Fiabilité / visibilité des runs
- Migration `021_detection_run_status_skipped.sql` : `ALTER TYPE automation_run_status ADD VALUE IF NOT EXISTS 'SKIPPED';` (additive).
- `src/services/hazard-detection.service.ts` :
  - 0 règle + `skipWhenNoRules` (L81-94) → `createRun` + `finishRun` status `SKIPPED` au lieu du return silencieux ; propager le nouveau statut dans les types (`DetectionRunStatus`).
  - accumuler le nombre d'alertes créées et l'écrire dans `finishRun` → colonne `alerts_created` (jamais remplie).
  - erreurs aval (`persistDetectionAndExposure` L510-512 qui ne `logger.warn` que) → faire passer le run en `PARTIAL` au lieu de `SUCCESS`.
- `src/repositories/hazard-detection.repository.ts` : `finishRun` accepte `alerts_created` (+ status `SKIPPED`).

### B5. Auto-publication
- `backend/.env` : `ALERTS_AUTO_PUBLISH=true`.
- `.env.example` : documenter `ALERTS_AUTO_PUBLISH` (+ `DETECTION_*` si absents). `.env.demo.example` reste `false`.
- `README.md` : ligne dans le tableau des variables d'env.

### B6. SSE temps réel (backend)
- Nouveau `src/services/realtime.service.ts` : bus en mémoire — `subscribe(res) → unsubscribe`, `publish(type, payload)` (broadcast `event: <type>\ndata: <json>\n\n`), ping keep-alive ~25 s, nettoyage sur `req.close`.
- Nouveau `src/routes/stream.routes.ts` : `GET /api/v1/stream` avec `authenticate` (header Bearer — le frontend lira le flux via `fetch`, donc header possible), headers `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`. Monté dans `src/routes/index.ts`. (Aucun `compression` ni timeout serveur — vérifié dans `app.ts`.)
- Émetteurs :
  - `src/services/automatic-alerts.service.ts` : après create/update (`generateForEvent`) → `alert.created` / `alert.updated` ; idem `generateForActiveEvents`.
  - `src/services/alerts.service.ts` : create / publish / archive manuels → mêmes événements.
  - `src/services/hazard-detection.service.ts` : en fin de run → `detection.run` (statut, events créados/mis à jour).

### B7. Contrat + docs backend
- `src/docs/openapi.yaml` : `post` sur `/detection-rules` (L2738), `patch`/`delete` sur `/detection-rules/{id}` (L2898), nouveau path `/stream` (tag `Détection automatique` ou nouveau tag `Temps réel`) ; valider via `tests/integration/docs.test.ts`.
- `docs/api.md` : lignes des nouveaux endpoints.

## Frontend (`D:\MadaRisk\frontend`)

### F1. Listener SSE
- Nouveau `src/lib/realtime.ts` (+ hook léger) : lecteur `fetch(API_BASE + '/stream', { headers: { Authorization } })`, parseur de frames SSE (`event:`/`data:`/ping), reconnexion avec backoff exponentiel (max ~30 s), lecture du token via `useAuthStore.getState()` → se connecte quand connecté, se coupe au logout, se reconnecte après refresh du token.
- Montage : `<RealtimeListener />` dans `src/App.tsx` dans `AuthBootstrap` (après `bootstrapped`, sous `QueryClientProvider`) ; mappe les événements → `queryClient.invalidateQueries` :
  - `alert.*` → `['alerts']` (préfixe → couvre `['alerts', page, …]`, `['alerts','urgent-banner']`, badge AppShell)
  - `detection.run` → `['events']`, `['dashboard']` (la détection crée des événements)

### F2. Métadonnées automatiques dans l'UI des alertes
- `src/types/index.ts` : ajouter `isAutomatic?: boolean` et `basis?: 'PREVISION' | 'OBSERVATION'` à `AlertListRow` (~L278).
- `src/pages/AlertesPage.tsx` :
  - badge « Automatique » (+ mention « Prévision »/« Observation » si `basis`) sur la ligne quand `a.isAutomatic` (près des badges statut/type, ~L290-295).
  - filtre « Origine » (Toutes / Automatique / Manuelle) dans la section filtres (~L226-268) → param `automatic` de `alertsApi.list` (déjà supporté backend) ; ajouter au query key `['alerts', page, status, type, origine]`.
- La bannière d'urgence `CrisisRoomPage.tsx:178` (filtre `PUBLIEE`) se met à marcher dès qu'une alerte auto est publiée — aucun changement needed.

### F3. Tests frontend
- Corriger les 24 échecs : sélecteurs `/Intervention administrative/` → tenir compte du prop `title` (`AlertesPage.test.tsx:47,82`, `EvenementsPage.test.tsx:51`, `EvenementDetailPage.test.tsx:142`).
- Ajouter un test AlertesPage : badge « Automatique » affiché si `isAutomatic`.
- Test unitaire du parseur de frames SSE si extrait en fonction pure.

## Vérification finale
1. Backend : `npm run lint` → `npm run typecheck` → `npm test` (suite complète, DB dev lancée).
2. `npm run db:migrate` + `npm run db:seed` → vérifier `SELECT count(*) FROM hazard_detection_rules` > 0.
3. Frontend : `npm run lint` → `npm test` → `npm run build`.
4. E2E manuel : `npm run dev` (backend + frontend) → login admin → « Rafraîchir » la météo depuis l'UI → un run de détection apparaît (`GET /detection/runs`) ; avec une règle déclenchée, un événement + alerte `PUBLIEE` `isAutomatic=true` apparaît dans AlertesPage sans recharger (SSE) et la bannière de la salle de crise s'affiche ; `curl -N` sur `/api/v1/stream` montre les événements.
5. Mettre à jour `AGENTS.md` (note « frontend sans tests » obsolète + commandes `npm test`).

## Hors scope (non demandés)
- UI d'administration des règles de détection (l'API CRUD suffit selon le choix utilisateur).
- Canaux externes (email/SMS/webhook).
- Cron de détection dédié (redondant : détection déjà déclenchée après sync planifiée + après refresh legacy).
