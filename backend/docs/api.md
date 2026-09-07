# API

Référence de l'API REST **MadaRisk Map** (préfixe `/api/v1`).

> La source de vérité exhaustive est la spécification **OpenAPI** servie sur `/api/docs` et `/api-docs` (fichier `src/docs/openapi.yaml`). Ce document en donne la vue consolidée.

## Enveloppes de réponse

**Succès**
```json
{ "success": true, "message": "…", "data": {…}, "meta": { "page": 1, "limit": 20, "total": 119, "totalPages": 6 } }
```

**Erreur**
```json
{ "success": false, "message": "…", "errors": [ { "field": "email", "message": "Email invalide" } ] }
```

- `422` : erreurs de validation **Zod** (corps / query / params).
- `401` : jeton absent ou invalide.
- `403` : rôle insuffisant.
- `404` : ressource introuvable.
- `409` / `400` : conflits métier (codes administratifs, statuts, poids de risque).
- `429` : dépassement de quota (rate limiting).
- `500` : erreur interne ; `502`/`503` : fournisseurs externes (météo, IA).

## Authentification

Tous les besoins d'écriture utilisent `Authorization: Bearer <accessToken>` (sauf `logout` qui prend `refreshToken` en corps).

| Méthode | Route | Rôle | Notes |
|---|---|---|---|
| POST | `/auth/register` | public | Premier `SUPER_ADMIN` (table users vide). 201 |
| POST | `/auth/login` | public | Rate limit 10/15 min. 200 → `{ accessToken, refreshToken, user }` |
| POST | `/auth/refresh` | public | Rotation du refresh token. Rate limit 30/15 min |
| POST | `/auth/logout` | public (corps `refreshToken`) | Révoque la session. 200 |
| GET | `/auth/me` | connecté | Profil courant. 200 |
| GET | `/users` | SUPER_ADMIN | `search`, `role`, `isActive`, pagination |
| POST | `/users` | SUPER_ADMIN | Corps : prénom, nom, email, mot de passe, rôle |
| GET | `/users/:id` | propriétaire / SUPER_ADMIN | Détail |
| PATCH | `/users/:id` | propriétaire / SUPER_ADMIN | `firstName`/`lastName`/`email` ; `role` seulement SUPER_ADMIN |
| PATCH | `/users/:id/status` | SUPER_ADMIN | `{ "isActive": boolean }` (dernier SUPER_ADMIN protégé) |
| PATCH | `/users/me/password` | connecté | `oldPassword` + `newPassword` |
| GET | `/system/database-status` | connecté | Status DB+PostGIS ; désactivé en production (403) |

## Territoires

| Méthode | Route | Query | Notes |
|---|---|---|---|
| GET | `/territories/districts` | `search`, `adminCode`, `includeGeometry`, pagination | Liste paginée (total réel) |
| GET | `/territories/districts/:id` | — | Détail + nb communes à risque |
| GET | `/territories/communes` | `search`, `adminCode`, `districtId`, `districtCode`, `riskLevel`, `eventId`, `includeGeometry`, pagination | Filtrage croisé |
| GET | `/territories/communes/:id` | — | Détail enrichi (district, météo, risque, événements) |
| GET | `/territories/search` | `q` ≥ 2, `limit` ≤ 20 | Districts + communes |
| GET | `/territories/map/districts` | `eventId`, `riskLevel`, `includeStats` | GeoJSON `FeatureCollection` |
| GET | `/territories/map/communes` | `districtId`, `districtCode`, `eventId`, `riskLevel`, `phase`, `includeRisk`, `includeGeometry` | GeoJSON enrichi (risque, phase, météo) |

## Imports & matching

Réservé **ANALYSTE_SIG / SUPER_ADMIN** (préfixe `imports`, `matching`).

| Méthode | Route | Notes |
|---|---|---|
| POST | `/imports` | `multipart/form-data` : `file` (.geojson/.json/.csv ≤ 50 Mo), `territoryType?`, `sourceName?`. 201 |
| GET | `/imports` | `status` (`BROUILLON|EN_COURS|TERMINE|ECHEC`), `fileType`, `territoryType` |
| GET | `/imports/:id` | Import + compteurs |
| GET | `/imports/:id/errors` | Erreurs ligne par ligne |
| POST | `/matching/run/:importId` | Algorithme : code exact → nom normalisé → alias → similarité. 200 |
| GET | `/matching` | `importId`, `status`, `targetType`, `minConfidence`, `maxConfidence` (0-100) |
| POST | `/matching/:id/approve` | Valide la proposition |
| POST | `/matching/:id/reject` | Corps `notes` requis (1-2000) |
| POST | `/matching/manual-link` | `sourceRecordId`, `targetType`, `districtId` ou `communeId`, `createAlias?`, `alias?` |
| GET | `/matching/statistics` | Répartition par statut/méthode |

## Événements

| Méthode | Route | Rôle | Notes |
|---|---|---|---|
| POST | `/events` | ADMIN/SUPER_ADMIN | `eventCode` (regex `^[A-Za-z0-9._-]+$`), `name`, `type`, `status?`, `severity?`, dates. 201 |
| GET | `/events` | connecté | `type`, `status`, `severity`, `startedAfter`, `startedBefore`, `search` |
| GET | `/events/:id` | connecté | Détail complet |
| PATCH | `/events/:id` | ADMIN/SUPER_ADMIN | Mise à jour |
| DELETE | `/events/:id` | SUPER_ADMIN | Suppression |
| PATCH | `/events/:id/status` | ADMIN/SUPER_ADMIN | `BROUILLON|PREVISION|ACTIF|SUIVI|CLOTURE` |
| POST | `/events/:id/tracks` | ADMIN/SUPER_ADMIN | Point : `lat`/`lng`, `trackType` (`OBSERVEE|PREVUE`), vent, pression, catégorie |
| GET | `/events/:id/tracks` | connecté | `trackType?` |
| GET | `/events/:id/track-geojson` | connecté | LineString + points |
| POST | `/events/:id/areas/calculate` | ADMIN/SUPER_ADMIN | `phase` (`AVANT|PENDANT|APRES|RETABLISSEMENT`), `riskLevel`, `radiusKm` (1-500) |
| GET | `/events/:id/areas` | connecté | Cercles d'influence |
| POST | `/events/:id/exposure/calculate` | ADMIN/SUPER_ADMIN | `areaId?` ou `allAreas?` ; calcule population/ménages/superficie |
| POST | `/events/:id/risks/recalculate` | ADMIN/SUPER_ADMIN | Recale les communes exposées d'un phase |
| GET | `/events/:id/exposed-communes` | connecté | `districtId?`, `riskLevel?`, `minDistanceKm?`, `maxDistanceKm?` |

Enums : `type` = `CYCLONE|INONDATION|SECHERESSE|FORTE_PLUIE|VENT_VIOLENT|GLISSEMENT_TERRAIN|FEU_VEGETATION|AUTRE` — `trackType` = `OBSERVEE|PREVUE`.

## Météo

| Méthode | Route | Notes |
|---|---|---|
| GET | `/weather/communes/:communeId/latest` | Dernière observation |
| GET | `/weather/communes/:communeId/forecast` | Prévisions 7 jours |
| GET | `/weather/communes/:communeId/history` | `dateFrom?`, `dateTo?`, pagination |
| GET | `/weather/map-layer` | `districtId?`, `eventId?`, `observedAt?` — GeoJSON |
| POST | `/weather/refresh/communes` | **ADMIN/SUPER_ADMIN** — `communeIds?` (1-500), `districtId?`, `eventId?`, `confirmAll?` (défaut false) |

## Risques & configurations

| Méthode | Route | Rôle | Notes |
|---|---|---|---|
| GET | `/risks/communes/:communeId` | connecté | `eventId?`, `latest?` |
| GET | `/risks/priority-communes` | connecté | `eventId?`, `districtId?`, `riskLevel?`, `limit` (1-100, défaut 20) |
| GET | `/risks/map-layer` | connecté | `districtId?`, `eventId?`, `riskLevel?`, `phase?` — GeoJSON |
| POST | `/risks/recalculate` | ADMIN/SUPER_ADMIN | `phase` requis + `eventId?`/`communeIds?`/`districtId?` |
| GET | `/risk-configurations` | connecté | Liste des configurations |
| GET | `/risk-configurations/:id` | connecté | Détail |
| POST | `/risk-configurations` | SUPER_ADMIN | Idempotence par `name` ; poids par défaut 0.30/0.25/0.20/0.15/0.10, seuils 20/40/60/80 |
| PATCH | `/risk-configurations/:id` | SUPER_ADMIN | Somme des poids = 1 ; seuils croissants |

## Alertes

| Méthode | Route | Rôle | Notes |
|---|---|---|---|
| POST | `/alerts` | ADMIN/SUPER_ADMIN | Cible `eventId` **ou** `districtId` **ou** `communeId` (un seul) ; `type`, `severity`, `title`, `message`, `expiresAt?`. 201 |
| GET | `/alerts` | connecté | `status`, `type`, `severity`, `eventId`, `districtId`, `communeId`, `activeOnly` |
| GET | `/alerts/:id` | connecté | Détail |
| PATCH | `/alerts/:id` | ADMIN/SUPER_ADMIN | Mise à jour |
| POST | `/alerts/:id/publish` | ADMIN/SUPER_ADMIN | Publie (BROUILLON → PUBLIEE) |
| POST | `/alerts/:id/archive` | ADMIN/SUPER_ADMIN | Archive |

## Tableau de bord

| Méthode | Route | Query |
|---|---|---|
| GET | `/dashboard/summary` | — |
| GET | `/dashboard/risk-distribution` | — |
| GET | `/dashboard/events-timeline` | `dateFrom?`, `dateTo?` |
| GET | `/dashboard/priority-communes` | `eventId?`, `districtId?`, `riskLevel?`, `limit` |

## Rapports & exports

| Méthode | Route | Rôle | Notes |
|---|---|---|---|
| GET | `/reports/dashboard` | ADMIN/SUPER_ADMIN | `dateFrom?`, `dateTo?` |
| GET | `/reports/events/:eventId` | connecté | Rapport détaillé d'un événement |
| POST | `/reports/export/csv` | connecté | `resourceType`: `communes|districts|events|alerts|risks|exposed-communes` + filtres |
| POST | `/reports/export/geojson` | connecté | `resourceType`: `communes|districts|event-areas|risks` ; `eventId` requis si `event-areas` |
| POST | `/reports/export/pdf` | ADMIN/SUPER_ADMIN | Génération + fichier |
| GET | `/reports` | ADMIN/SUPER_ADMIN | `format`, `reportType`, `eventId` |
| GET | `/reports/:id/download` | ADMIN/SUPER_ADMIN | Téléchargement |

## Assistant IA

| Méthode | Route | Notes |
|---|---|---|
| POST | `/ai/chat` | connecté — `message` (1-5000), `conversationId?` ; rate limit 30/15 min ; 503 si non configuré |
| GET | `/ai/conversations` | connecté — pagination (limit ≤ 50) |
| GET | `/ai/conversations/:id` | propriétaire — historique des messages |
| DELETE | `/ai/conversations/:id` | propriétaire — 204 |

Voir [`ai-security.md`](ai-security.md) pour le comportement selon les rôles.