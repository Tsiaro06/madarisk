# PROMPT — Création du frontend MadaRisk Map

## Contexte

Tu dois créer le **frontend complet** de la plateforme **MadaRisk Map**, un outil SIG de surveillance et d'anticipation des catastrophes naturelles à Madagascar (cyclones, inondations, sécheresses, etc.). Le backend est déjà terminé : une API REST Express/TypeScript (`Node.js 20`, `PostgreSQL 16 + PostGIS 3.4`) exposée sous `/api/v1`, avec **68+ endpoints**, une authentification JWT (access + refresh avec rotation), 4 rôles, et des réponses GeoJSON prêtes pour Leaflet. Tous les endpoints sont documentés dans la spec OpenAPI servi sur `/api/docs` (fichier `src/docs/openapi.yaml`).

**Ton objectif** : créer un frontend React complet, en français (interface + libellés), qui consomme **100 % des fonctionnalités du backend** avec une expérience fluide et professionnelle, orientée "salle de crise".

## Stack technique imposée

- **React 18 + TypeScript strict** (Vite)
- **Leaflet + react-leaflet** pour toute la cartographie (les endpoints GeoJSON sont déjà formatés `FeatureCollection` pour Leaflet ; **ne pas** convertir, les consommer directement)
- **React Router v6+** (routing, guard par rôle)
- **TanStack Query** pour les données serveur (caching, invalidation après mutations)
- **Zustand ou Context** pour l'état d'authentification
- **Axios** avec intercepteurs (injection du `Bearer`, **refresh automatique + retry** quand le token expire)
- **Tailwind CSS** ou un design system comme **shadcn/ui** (choix à ta convenance mais cohérent partout)
- **Recharts** (ou charting équivalent) pour le dashboard
- **`react-hook-form` + zod** pour les formulaires (les erreurs backend `422` sont déjà au format `{ field, message }`)
- Gestion des dates : `date-fns` (clés ISO)

## Enveloppes API à respecter

Toutes les réponses backend suivent ce format :
- Succès : `{ success: true, message, data, meta?: { page, limit, total, totalPages } }`
- Erreur : `{ success: false, message, errors?: [{ field, message }] }`

Le client axios doit wrapper ces formats : un client typé `apiClient` qui retourne `data` directement et lève des erreurs structurées contenant `message` + `errors`. Gérer les statuts : `401` (token), `403` (rôle), `404`, `409/400` (conflit métier), `422` (validation → afficher sous les champs), `429` (rate limit → afficher message + respecter `Retry-After`), `502/503` (fournisseurs externes météo/IA → message "service indisponible").

## Rôles & permissions (matrice à implémenter dans les guards)

| Rôle | Droits |
|---|---|
| `SUPER_ADMIN` | Tout ; gestion utilisateurs (CRUD, statuts, rôles) ; configurations de risque ; suppression d'événements ; imports/matching |
| `ADMIN` | Gestion opérationnelle : événements, trajectoires, zones d'exposition, météo (refresh), recalcul des risques, alertes, rapports PDF |
| `ANALYSTE_SIG` | Imports de fichiers SIG & matching (approbation/rejet/liens manuels) |
| `CLIENT` | Consultation seule : cartes, territoires, événements, alertes, dashboard, rapports, assistant IA |

Le menu, les routes et les boutons d'action doivent être filtrés selon `user.role`.

## Authentification — comportement précis

- Pages publiques : `login`. L'écran d'accueil doit pouvoir remplir l'état "premier utilisateur" : si la table est vide, `POST /auth/register` crée le premier `SUPER_ADMIN` → **détecter** que `login` ne marche pas / une route dédiée `register` (1 seul compte) doit être proposée selon la réponse du backend.
- Stocker `accessToken` (mémoire) et `refreshToken` (localStorage sécurisé). `POST /auth/refresh` fait la rotation (le body de réponse contient les 2 nouveaux jetons). Sur `401` → refresh → retry 1 fois ; si échec → logout + redirection `/login`.
- `POST /auth/logout` avec `{ refreshToken }` dans le corps (pas de Bearer).
- `GET /auth/me` au chargement pour restaurer la session + garder `user` à jour.
- `PATCH /users/me/password` : page "changer mon mot de passe" (ancien + nouveau).
- Gérer les 429 du login et du refresh avec compte à rebours.

## Pages / modules à créer (URL routing proposé)

1. **`/login`** — connexion, état "premier admin" (register), gestion 429.
2. **`/` Dashboard** — page principale "Salle de crise" :
   - `GET /dashboard/summary` : cartes KPI (événements actifs, alertes actives, communes à risque, population exposée)
   - `GET /dashboard/risk-distribution` : répartition par niveau de risque (bar chart)
   - `GET /dashboard/events-timeline` : chronologie (période filtrable)
   - `GET /dashboard/priority-communes` : top communes prioritaires (table + lien vers fiche)
   - **Carte** : affichage GeoJSON `risks/map-layer` coloré par niveau + événements actifs
3. **`/territoires`** — explorateur :
   - Tables paginées districts & communes (`getDistricts`, `getCommunes`) avec filtres (`search`, `adminCode`, `districtId`, `districtCode`, `riskLevel`, `eventId`)
   - `GET /territories/search` : barre de recherche globale (q ≥ 2, limit ≤ 20) avec autocomplétion
   - Fiche district (`:id`) : détail + nb communes à risque
   - Fiche commune (`:id`) : détail enrichi (résumé météo, risque, événements liés, informations district)
   - Onglet carte : couches `map/districts` et `map/communes` (GeoJSON stylées selon `riskLevel`/`phase`), popups cliquables
4. **`/imports`** (ANALYSTE_SIG/SUPER_ADMIN) — import & matching :
   - Page d'import : sélection d'un fichier `.geojson/.json/.csv` (≤ 50 Mo, multipart), `territoryType`, `sourceName`, statut progressif ; liste des imports (`status`, `fileType`, `territoryType`), détail avec compteurs et **tableau des erreurs ligne à ligne** (`imports/:id/errors`)
   - Page matching : lancer `matching/run/:importId`, liste des propositions (filtres `status`, `targetType`, `minConfidence`, `maxConfidence`), actions **Approuver** / **Rejeter** (note obligatoire 1-2000) / **Lien manuel** (choix district OU commune, `createAlias`), tableau de stats (`matching/statistics`) et "via carte" pour valider visuellement un lien
5. **`/evenements`** et **`/evenements/:id`** — gestion de crise :
   - Liste (`type`, `status`, `severity`, `startedAfter`, `startedBefore`, `search`), cycle de vie avec badges `BROUILLON → PREVISION → ACTIF → SUIVI → CLOTURE`
   - CRUD (création via formulaire `eventCode/name/type/status/severity/dates`), édition, changement de statut, suppression (SUPER_ADMIN)
   - Fiche événement :
     - Carte : trajectoire (`track-geojson`), points de trajectoire (`OBSERVEE|PREVUE`) avec vent/pression/catégorie, cercles d'influence (`areas`), couche des **communes exposées** (`exposed-communes` avec filtres `districtId/riskLevel/minDistanceKm/maxDistanceKm`)
     - Actions : ajouter un point de trajectoire (clic carte → formulaire lat/lng), calculer zone d'influence (`phase`, `riskLevel`, `radiusKm` 1-500), calculer exposition (`areaId`/`allAreas`), recalculer les risques du phase
6. **`/meteo`** — par commune :
   - `latest` (dernière observation), `forecast` (7 jours, graphique), `history` (`dateFrom`/`dateTo`, pagination)
   - Carte : couche `weather/map-layer` avec filtre `districtId`/`eventId`/`observedAt`
   - Bouton "Rafraîchir" (ADMIN/SUPER_ADMIN) → `refresh/communes` avec choix : communes sélectionnées / district / événement / `confirmAll` (confirmation explicite)
7. **`/risques`** :
   - Consultation par commune (`risks/communes/:communeId` avec `eventId?`/`latest?`)
   - Top communes prioritaires (tableau + carte)
   - Carte de risque (`map-layer`, filtres district/événement/niveau/phase)
   - **Recalcul** (ADMIN/SUPER_ADMIN) : formulaire avec `phase` requis + périmètre (`eventId`/`communeIds`/`districtId`)
   - **`/configurations-risque`** (SUPER_ADMIN) : liste + édition/création de configurations (poids initiaux 0.30/0.25/0.20/0.15/0.10, seuils 20/40/60/80) avec validation client (somme des poids = 1, seuils strictement croissants)
8. **`/alertes`** :
   - Liste (filtres `status/type/severity/eventId/districtId/communeId/activeOnly`)
   - Création/édition : cible **exclusive** (eventId OU districtId OU communeId — validateur à gérer côté client), `type`, `severity`, `title`, `message`, `expiresAt?`
   - Actions : **publier** (BROUILLON → PUBLIEE), **archiver**, détail
9. **`/rapports`** :
   - Rapport dashboard (`reports/dashboard`, période)
   - Rapport événement (`reports/events/:eventId`)
   - **Exports** : CSV (`resourceType` : communes/districts/events/alerts/risks/exposed-communes + filtres) ; GeoJSON (communes/districts/event-areas/risks) ; **PDF** (ADMIN, génération + téléchargement du fichier renvoyé)
   - Liste des rapports générés + téléchargement (`reports/:id/download`)
10. **`/assistant-ia`** — chat :
    - `POST /ai/chat` (message 1-5000, `conversationId` pour continuer), messages avec historique
    - Liste des conversations (pagination limit ≤ 50), chargement d'une conversation, suppression (204)
    - **Cas particuliers** : si `503` → afficher "Assistant non disponible" et masquer la saisie ; si `429` → gérer `Retry-After` ; SUPER_ADMIN peut voir les conversations des autres si `AI_SUPER_ADMIN_VIEW_CONVERSATIONS`
11. **`/administration`** (SUPER_ADMIN) — utilisateurs :
    - Liste paginée (`search`, `role`, `isActive`), CRUD, changement de rôle, activation/désactivation (`users/:id/status`) avec avertissement "dernier SUPER_ADMIN protégé"
    - Indicateur comm (status DB) possible depuis `GET /system/database-status`
12. **Layout applicatif** : sidebar/navbar avec accès selon rôle, **bandeau d'urgence** affichant les alertes actives (`activeOnly`), menu utilisateur (profil, mot de passe, logout), gestion d'état de chargement/erreur globale, page 404, page "non autorisé" (403).

## Composants transverses

- **Handler d'erreur global** : toast/notification pour `message` ; erreurs `errors[]` rattachées aux champs de formulaire.
- **Tableaux** : tri, pagination (meta), filtres persistés dans l'URL (query params).
- **Cartes Leaflet** : base tiles OSM, composant réutilisable `<RiskMapLayer>` acceptant une `FeatureCollection` + style par `riskLevel` (`FAIBLE=vert, MODERE=jaune, ELEVE=orange, EXTREME=rouge`) et par `phase` ; popups templatisés ; contrôles de zoom ; légende dynamique.
- **Sélecteur d'événement actif** global (contexte) pour filtrer les cartes/communes en mode crise.

## Exigences de qualité

- **TypeScript strict** : définir les types `ApiSuccess<T>`, `ApiError`, et générer des types par module (Territory, District, Commune, Event, Track, Area, Alert, RiskConfiguration, Import, MatchingCandidate, WeatherObservation, WeatherForecast, Conversation, AiMessage, User, etc.) alignés sur les données réelles retournées par le backend.
- **Zod front** en miroir des validateurs backend pour les formulaires principaux (dates, regex `eventCode`, rayon 1-500, etc.).
- **Accessibilité** (rôles ARIA), **responsive**, états vides et skeleton loading.
- **Vite proxy** vers `http://localhost:5000` (ou base URL via `VITE_API_URL`) et `VITE_APP_NAME`.
- Pas de logique métier dupliquée en front ; tout passe par l'API.
- Documenter chaque module brièvement (courts README par page si besoin) et fournir de quoi démarrer (`npm run dev`).

## Feuille de route d'implémentation (ordre conseillé)

1. Setup Vite + TS + Tailwind/shadcn + Router + Axios (client + intercepteurs refresh) + Auth store
2. Auth (login/register/me/refresh/logout/mot de passe) + guards de rôle + layout
3. Dashboard (KPI + charts + carte risque)
4. Territoires (tables + fiches + cartes GeoJSON + recherche)
5. Événements (CRUD + trajectoires + zones + exposition + communes exposées)
6. Météo (fiche commune + couche carte + refresh)
7. Risques (consultation, prioritaires, recalcul, configurations)
8. Alertes (liste, CRUD, publication, archivage)
9. Imports & matching (upload, erreurs, matching UI, approbation)
10. Rapports & exports (dashboard, événement, CSV/GeoJSON/PDF, liste/téléchargement)
11. Assistant IA (chat, conversations, cas 503/429)

**Rappel clé de la spec backend** : la vision de l'architecture prévoit nativement un client **React + Leaflet**. Respecte exactement les routes, méthodes et formats de requête ci-dessus (elles proviennent de `docs/api.md`, la source de vérité étant Swagger sur `/api/docs`).