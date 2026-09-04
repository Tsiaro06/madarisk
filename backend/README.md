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
