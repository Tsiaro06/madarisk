# MadaRisk Map — Backend API

Plateforme SIG de surveillance et d'anticipation des catastrophes naturelles à Madagascar.

## Prérequis

- Node.js >= 20
- PostgreSQL 16 + PostGIS 3.4
- npm ou yarn

## Installation

```bash
cd backend
cp .env.example .env
# Modifier .env avec vos paramètres
npm install
```

## Commandes

| Commande | Description |
|---|---|
| `npm run dev` | Démarrer en mode développement (hot reload) |
| `npm run build` | Compiler TypeScript |
| `npm start` | Démarrer en production |
| `npm run lint` | Vérifier le code avec ESLint |
| `npm run lint:fix` | Corriger automatiquement |
| `npm run typecheck` | Vérifier les types des sources (`tsc --noEmit`) |
| `npm run typecheck:test` | Vérifier les types des sources + tests |
| `npm run format` | Formater avec Prettier |
| `npm run format:check` | Vérifier le formatage |
| `npm test` | Exécuter les tests |
| `npm run db:migrate` | Lancer les migrations |
| `npm run db:seed` | Insérer les données de démo |
| `npm run db:check` | Vérifier la connexion DB |

## Démarrage local

1. Créer la base `mada_risk` dans PostgreSQL.
2. Activer l'extension PostGIS : `CREATE EXTENSION IF NOT EXISTS postgis;`
3. Copier `.env.example` en `.env` et renseigner les secrets.
4. `npm run db:migrate`
5. `npm run db:seed`
6. `npm run dev`
7. Tester : `GET http://localhost:5000/health`
8. Documentation interactive : `http://localhost:5000/api-docs`

## Health Check

```http
GET /api/v1/health
```

Réponse :
```json
{
  "success": true,
  "message": "API MadaRisk Map opérationnelle.",
  "data": {
    "status": "ok",
    "environment": "development",
    "database": "connected",
    "timestamp": "2026-09-01T00:00:00.000Z"
  }
}
```

## Authentification & Utilisateurs (Phase 4)

Authentification par paires de jetons JWT (access + refresh avec rotation), sessions en base, enregistrement des actions dans les logs d'audit.

### Rôles

| Rôle | Droits |
|---|---|
| `SUPER_ADMIN` | Toutes les opérations, gestion des utilisateurs et des rôles |
| `ADMIN` | Accès limité (pas de gestion des rôles/utilisateurs) |
| `ANALYSTE_SIG` | Accès SIG |
| `CLIENT` | Accès client |

Tous les endpoints ci-dessous sont préfixés par `/api/v1`.

### POST /auth/register

Crée le **premier** `SUPER_ADMIN`. Cette route ne fonctionne que si la table `users` est vide.

```bash
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Admin","lastName":"Principal","email":"super.admin@madarisk.mg","password":"Tr3sFort!2026"}'
```

Réponse `201` : objet utilisateur **sans** `passwordHash`.

### POST /auth/login

```bash
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@madarisk.local","password":"VotreMotDePasse"}'
```

Réponse `200` :
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi...",
    "user": { "id": "...", "email": "admin@madarisk.local", "role": "SUPER_ADMIN", "isActive": true }
  }
}
```

### POST /auth/refresh

Rafraîchit la session (rotation du refresh token). Ancien token révoqué.

```bash
curl -X POST http://localhost:5000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"eyJhbGciOi..."}'
```

### POST /auth/logout

Révoque la session. Le refresh token devient inutilisable.

```bash
curl -X POST http://localhost:5000/api/v1/auth/logout \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"eyJhbGciOi..."}'
```

### GET /auth/me

Profil de l'utilisateur connecté. Nécessite un access token.

```bash
curl http://localhost:5000/api/v1/auth/me \
  -H "Authorization: Bearer VOTRE_ACCESS_TOKEN"
```

### Gestion des utilisateurs (nécessite un bearer token)

| Méthode | Route | Rôle requis | Description |
|---|---|---|---|
| `GET` | `/users` | `SUPER_ADMIN` | Liste paginée (query : `page`, `limit`, `role`, `isActive`, `search`) |
| `POST` | `/users` | `SUPER_ADMIN` | Créer un utilisateur (rôle ne peut pas être `SUPER_ADMIN`) |
| `GET` | `/users/:id` | `SUPER_ADMIN` ou propriétaire | Détail d'un utilisateur |
| `PATCH` | `/users/:id` | `SUPER_ADMIN` ou propriétaire | Modifier prénom/nom/email ; `role` seulement par `SUPER_ADMIN` |
| `PATCH` | `/users/:id/status` | `SUPER_ADMIN` | Activer/désactiver (`{"isActive": true}`) |
| `PATCH` | `/users/me/password` | connecté | Changer son mot de passe |

Créer un utilisateur :

```bash
curl -X POST http://localhost:5000/api/v1/users \
  -H "Authorization: Bearer VOTRE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Jean","lastName":"Rakoto","email":"jean.rakoto@madarisk.mg","password":"MotDepasse123!","role":"ANALYSTE_SIG"}'
```

Changer son mot de passe :

```bash
curl -X PATCH http://localhost:5000/api/v1/users/me/password \
  -H "Authorization: Bearer VOTRE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"oldPassword":"AncienMdp!1","newPassword":"NouveauMdp!2"}'
```

### Règles de sécurité

- `passwordHash` n'est jamais renvoyé par l'API.
- Mots de passe hachés avec bcrypt (coût 12).
- Le dernier `SUPER_ADMIN` actif ne peut être ni désactivé ni rétrogradé.
- Limitation de débit sur `login` (10/15 min) et `refresh` (30/15 min).
- Toutes les actions sensibles sont consignées dans `audit_logs`.

### Exemple Postman

1. Ajouter une collection avec l'URL de base `http://localhost:5000/api/v1`.
2. Variable d'environnement `access_token` remplie après `login`.
3. Définir l'en-tête `Authorization: Bearer {{access_token}}` au niveau de la collection.
4. Variable `refresh_token` pour `refresh`/`logout`.

## Documentation interactive (Swagger)

La documentation OpenAPI de l'API est servie par Swagger UI à l'adresse :

```text
http://localhost:5000/api-docs
```

- Cliquer sur **Authorize** et renseigner le jeton d'accès (`Bearer <ACCESS_TOKEN>`) pour tester les endpoints protégés.
- Le fichier source de la spécification est `src/docs/openapi.yaml`.
- Il est copié automatiquement dans `dist/docs` lors du `npm run build`.

## Territoires (Phase 5)

Exposition des **districts** et des **communes** réels (Madagascar) via une API REST, avec recherche, pagination, filtres et réponses **GeoJSON** directement utilisables par **Leaflet**.

Tous les endpoints de cette section sont préfixés par `/api/v1` et **nécessitent un access token** (`Authorization: Bearer <token>`).

### Liste et recherche

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/territories/districts` | Liste paginée des districts |
| `GET` | `/territories/districts/:id` | Détail d'un district (+ nombre de communes à risque) |
| `GET` | `/territories/communes` | Liste paginée des communes (filtres district / risque / événement) |
| `GET` | `/territories/communes/:id` | Détail d'une commune (météo, risque, événements associés) |
| `GET` | `/territories/search?q=...` | Recherche de districts et de communes (q ≥ 2 caractères) |

### Responsives pour Leaflet (GeoJSON)

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/territories/map/districts` | `FeatureCollection` des districts |
| `GET` | `/territories/map/communes` | `FeatureCollection` des communes |

### Paramètres de requête courants

**`GET /territories/districts`**
- `page` (default 1), `limit` (default 20, max 100)
- `search` : filtre sur le nom / code
- `adminCode`
- `includeGeometry=true|false` : inclure la géométrie complète

**`GET /territories/communes`**
- `page`, `limit`, `search`, `adminCode`, `includeGeometry`
- `districtId` ou `districtCode` : filtrer par district
- `riskLevel` : `FAIBLE | MODERE | ELEVE | EXTREME`
- `eventId` : communes liées à un événement

**`GET /territories/map/communes`**
- `districtId`, `districtCode`, `eventId`
- `riskLevel`, `phase` : `AVANT | PENDANT | APRES | RETABLISSEMENT`
- `includeRisk=true` (default) : enrichir chaque feature avec score/niveau de risque et météo
- `includeGeometry=true|false` : inclure la géométrie

### Exemples

**Lister les districts (3 premiers) :**

```bash
curl "http://localhost:5000/api/v1/territories/districts?limit=3" \
  -H "Authorization: Bearer VOTRE_ACCESS_TOKEN"
```

Réponse (`200`) :
```json
{
  "success": true,
  "message": "Liste des districts",
  "data": [
    {
      "id": "f0b2...",
      "adminCode": "114",
      "name": "Maroantsetra",
      "normalizedName": "MAROANTSETRA",
      "population": 234000,
      "vulnerabilityScore": 0.62,
      "centroid": { "type": "Point", "coordinates": [49.66, -15.44] },
      "totalCommunes": 17
    }
  ],
  "meta": { "page": 1, "limit": 3, "total": 119 }
}
```

**Rechercher « maro » :**

```bash
curl "http://localhost:5000/api/v1/territories/search?q=maro" \
  -H "Authorization: Bearer VOTRE_ACCESS_TOKEN"
```

**Couches Leaflet (districts et communes) :**

```bash
curl "http://localhost:5000/api/v1/territories/map/districts" \
  -H "Authorization: Bearer VOTRE_ACCESS_TOKEN"

curl "http://localhost:5000/api/v1/territories/map/communes?districtCode=114&includeRisk=true" \
  -H "Authorization: Bearer VOTRE_ACCESS_TOKEN"
```

Réponse (`200`, GeoJSON `FeatureCollection`) :
```json
{
  "success": true,
  "message": "Communes FeatureCollection",
  "data": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "id": "commune-uuid",
        "geometry": { "type": "MultiPolygon", "coordinates": [...] },
        "properties": {
          "communeId": "...",
          "communeCode": "...",
          "commune": "Maroantsetra",
          "districtId": "...",
          "districtCode": "114",
          "district": "Maroantsetra",
          "population": 52000,
          "riskLevel": "ELEVE",
          "displayLevel": "Élevé",
          "color": "#FFA726",
          "phase": "AVANT",
          "riskScore": 72.4
        }
      }
    ]
  }
}
```

### Détail d'une commune (`GET /territories/communes/:id`)

Retourne la commune avec son district parent, sa géométrie, la **dernière observation météo** (`weather`), le **dernier risque évalué** (`risk`) et la liste des **événements** auxquels elle est exposée (`events`).

## Imports administratifs & Matching (Phase 6)

Import de données administratives externes (fichiers **GeoJSON**, **JSON** tabulaire ou **CSV**) vers les territoires SIG (districts / communes), puis mise en correspondance automatique des enregistrements avec les territoires, avec validation manuelle.

Tous les endpoints sont préfixés par `/api/v1` et réservés aux rôles **`ANALYSTE_SIG`** et **`SUPER_ADMIN`** (`Authorization: Bearer <token>`).

### POST /imports

Importe et traite un fichier. Requête `multipart/form-data` :
- champ `file` : le fichier (`.geojson`, `.json` ou `.csv`, max 50 Mo)
- champ `territoryType` (optionnel) : `DISTRICT` ou `COMMUNE`

```bash
curl -X POST http://localhost:5000/api/v1/imports \
  -H "Authorization: Bearer VOTRE_ACCESS_TOKEN" \
  -F "territoryType=DISTRICT" \
  -F "file=@districts.geojson"
```

Réponse `201` :
```json
{
  "success": true,
  "message": "Import créé et traité",
  "data": {
    "importId": "...",
    "totalRecords": 17,
    "validRecords": 16,
    "invalidRecords": 1,
    "errors": [{ "row": 8, "reason": "Ligne sans nom ni code administratif" }]
  }
}
```

**Formats acceptés :**

- **GeoJSON** — `FeatureCollection` ; les propriétés de chaque `Feature` sont lues (`nom`, `code`, …).
- **JSON** — tableau d'objets ou objet contenant un tableau d'objets.
- **CSV** — première ligne = en-têtes (`nom,code`).

Exemple **JSON** (`districts.json`) :
```json
[
  { "nom": "Maroantsetra", "code": "114" },
  { "nom": "Toamasina I", "code": "502" }
]
```

Exemple **CSV** (`districts.csv`) :
```csv
nom,code
Maroantsetra,114
Toamasina I,502
```

### POST /matching/run/:importId

Calcule les correspondances entre les enregistrements d'un import et les territoires. Algorithme par priorité : **code administratif exact (100)** → **nom normalisé (98)** → **alias (96)** → **similarité contrôlée (≥ 95)**.

- Candidat unique → proposition `EN_ATTENTE` (aucune auto-validation).
- Plusieurs candidats → compté `AMBIGU`, aucune association automatique.
- Aucun candidat → compté `unmatched`.

```bash
curl -X POST http://localhost:5000/api/v1/matching/run/IMPORT_ID \
  -H "Authorization: Bearer VOTRE_ACCESS_TOKEN"
```

Réponse `200` :
```json
{
  "success": true,
  "message": "Correspondances calculées",
  "data": { "total": 17, "proposed": 15, "ambiguous": 1, "unmatched": 1 }
}
```

### GET /matching

Liste paginée des correspondances. Filtres : `importId`, `status` (`EN_ATTENTE | VALIDE | REJETE | AMBIGU`), `targetType` (`DISTRICT | COMMUNE`), `minConfidence`, `maxConfidence`.

### Décisions manuelles

| Méthode | Route | Description |
|---|---|---|
| `POST` | `/matching/:id/approve` | Valider une proposition (`VALIDE`) |
| `POST` | `/matching/:id/reject` | Rejeter — corps `{"notes": "..."}` (obligatoire) |
| `POST` | `/matching/manual-link` | Liaison manuelle `MANUEL` (score 100, `VALIDE`) : `sourceRecordId`, `targetType`, `districtId` ou `communeId`, optionnel `createAlias` + `alias` |

### GET /matching/statistics

Statistiques : répartition par statut et par méthode de matching.

## Stack technique

- **Runtime** : Node.js 20
- **Langage** : TypeScript (strict)
- **Framework** : Express.js
- **Base de données** : PostgreSQL + PostGIS
- **Validation** : Zod
- **Auth** : JWT + bcrypt
- **Logs** : Pino
- **Sécurité** : Helmet, CORS, rate-limiting

## Licence

Projet interne MadaRisk Map.
