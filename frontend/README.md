# MadaRisk Map — Frontend

Client React de la plateforme SIG **MadaRisk Map** (salle de crise) : cartographie des risques, événements, alertes, météo, imports SIG, rapports et assistant IA.

## Stack

- React 18+ / TypeScript (Vite)
- React Router, TanStack Query, Zustand
- Axios (Bearer + refresh automatique)
- Leaflet / react-leaflet (GeoJSON natif)
- Tailwind CSS v4, Recharts, react-hook-form + Zod

## Prérequis

1. Backend API sur `http://localhost:5000` (`/api/v1`, docs Swagger `/api/docs`)
2. Node.js 20+

## Démarrage

```bash
cd madarisk/frontend
cp .env.example .env   # si besoin
npm install
npm run dev
```

Ouvrir [http://localhost:5173](http://localhost:5173).

Le proxy Vite redirige `/api` et `/health` vers `http://localhost:5000`.

Variables utiles :

| Variable | Défaut | Rôle |
|---|---|---|
| `VITE_API_URL` | `/api/v1` | Base API |
| `VITE_APP_NAME` | `MadaRisk Map` | Titre applicatif |

## Authentification

- `/login` : connexion JWT ; onglet **premier SUPER_ADMIN** via `POST /auth/register` si la base n’a pas encore d’utilisateur
- `accessToken` en mémoire, `refreshToken` en `localStorage`
- Refresh + retry sur `401` ; logout sur échec
- Compte de démo fréquent (si seed) : `admin@madarisk.mg` / `Admin@123!`

## Modules

| Route | Rôles | Contenu |
|---|---|---|
| `/` | tous | Dashboard KPI, charts, carte risques |
| `/territoires` | tous | Districts / communes + cartes + fiches |
| `/evenements` | tous (+ ops ADMIN) | CRUD, trajectoires, zones, exposition |
| `/meteo` | tous (+ refresh ADMIN) | Observations, prévisions, couche carte |
| `/risques` | tous (+ recalcul ADMIN) | Prioritaires, carte, recalcul |
| `/configurations-risque` | SUPER_ADMIN | Pondérations & seuils |
| `/alertes` | tous (+ ops ADMIN) | Liste, création, publier, archiver |
| `/imports` `/matching` | ANALYSTE_SIG, SUPER_ADMIN | Upload SIG & matching |
| `/rapports` | tous (+ PDF ADMIN) | Exports CSV / GeoJSON / PDF |
| (bulle bas-droite) | tous | Assistant IA flottant sur chaque page |
| `/administration` | SUPER_ADMIN | Utilisateurs |
| `/mot-de-passe` | tous | Changement de mot de passe |

## Scripts

```bash
npm run dev      # développement
npm run build    # tsc + bundle production
npm run preview  # servir dist/
```

## Structure

```
src/
  api/           # client Axios + modules REST
  components/    # UI, layout, carte Leaflet, guards
  pages/         # écrans métier
  schemas/       # Zod miroir backend
  stores/        # auth + événement de crise
  types/         # types API
  routes/        # AppRouter
```

Source de vérité des contrats : backend `src/docs/openapi.yaml` (`/api/docs`).
