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
