# Diagramme de déploiement UML — MadaRisk Map

Code **PlantUML** du diagramme de déploiement. Établi à partir de
`backend/Dockerfile`, `backend/docker-compose.yml`, `backend/docs/deployment.md`,
`frontend/vite.config.ts`, `backend/src/config/env.ts` et des jobs planifiés.

Le fichier contient trois vues :

1. **Production** — API conteneurisée + PostgreSQL/PostGIS managé + SPA statique.
2. **Locale (Docker Compose)** — pile éphémère de développement.
3. **Intégration continue** — GitHub Actions.

---

## 1. Production

```plantuml
@startuml madarisk_deploiement_production
title MadaRisk Map — Déploiement (production)
skinparam shadowing false
skinparam componentStyle rectangle
left to right direction

actor "Analyste / Décideur" as USER

node "Poste de travail" <<device>> as WORKSTATION {
  node "Navigateur" <<executionEnvironment>> as BROWSER {
    artifact "SPA React 19 + Vite + Tailwind v4" as WEBAPP
  }
}

node "Hébergement statique\n(CDN / Render Static / Nginx)" <<device>> as STATICHOST {
  artifact "Build Vite : dist/ (HTML, JS, CSS)" as SPABUNDLE
}

node "Serveur d'application\n(VPS / fly.io / Render)" <<device>> as APPHOST {
  node "Conteneur API\nnode:20-alpine" <<executionEnvironment>> as API {
    artifact "dist/server.js\nExpress 4 — /api/v1 — :5000" as APPBIN
    component "Jobs planifiés\nnode-cron (×5)" as JOBS
    component "Bus temps réel\nSSE en mémoire" as RT
    component "Assistant IA\n(provider Gemini,\nfunction calling)" as AI
    component "Téléversements\n(multer)" as UPLOAD
  }
  folder "Volume uploads/\nimports + reports" as VOL
}

cloud "PostgreSQL managé\nPostgreSQL 16 + PostGIS 3.4\n(5432)" as DB
cloud "Open-Meteo\n(observations / prévisions)" as OM
cloud "DGM Maproom\n(pluie décadaire)" as DGM
cloud "GDACS + IBTrACS/NCEI\n(veille cyclonique)" as CYCLO
cloud "Google Gemini\n(assistant IA)" as GEMINI

node "CI/CD — GitHub Actions" <<device>> as CI

USER --> BROWSER : utilise
BROWSER --> STATICHOST : HTTPS
STATICHOST ..> SPABUNDLE : sert
BROWSER --> API : HTTPS — REST JSON (/api/v1)\n+ flux SSE (/stream, /ai/chat)
API --> DB : TCP 5432 — protocole PostgreSQL\n(pool pg + PostGIS)
API --> VOL : écriture / lecture fichiers
API --> OM : HTTPS — quota par coordonnées
API --> DGM : HTTPS
JOBS --> CYCLO : HTTPS — détection des systèmes actifs
AI --> GEMINI : HTTPS — génération des réponses\n(flux SSE + function calling)
CI ..> API : construit et publie l'image Docker
CI ..> STATICHOST : construit le bundle Vite

note bottom of API
  ENABLE_SCHEDULED_JOBS=true sur UN SEUL réplica.
  Les crons et le bus SSE sont en mémoire du processus :
  plusieurs réplicas => doubles exécutions et abonnés
  répartis de façon incohérente.
end note

note bottom of DB
  En production, la base est externe (managée).
  Ne PAS activer le profil `db` de Compose.
  DATABASE_URL pointe vers cet hôte.
end note

note bottom of GEMINI
  Offre gratuite : plafond JOURNALIER
  (20 requêtes / jour / projet).
  Un 429 est relayé tel quel avec `Retry-After`,
  sans relance inutile.
end note
@enduml
```

---

## 2. Locale (Docker Compose)

```plantuml
@startuml madarisk_deploiement_local
title MadaRisk Map — Déploiement local (Docker Compose)
skinparam shadowing false
skinparam componentStyle rectangle
left to right direction

node "Machine de développement" <<device>> as DEVBOX {

  node "Serveur Vite (dev)" <<executionEnvironment>> as VITE {
    artifact "SPA React — :5173\nproxy /api et /health" as SPADEV
  }

  node "Réseau Docker Compose" <<device>> as NET {

    node "Conteneur api" <<executionEnvironment>> as API {
      artifact "Dockerfile (runner)\nnode:20-alpine — :5000" as APBIN
      component "HEALTHCHECK GET /health" as HC
    }

    node "Conteneur db (profil \"db\")" <<executionEnvironment>> as DB {
      database "postgis/postgis:16-3.4\nbase mada_risk" as PG
    }

    node "Conteneur migrate (one-shot)" <<executionEnvironment>> as MIG {
      artifact "Dockerfile (builder, tsx)\nnpm run db:migrate" as MIGBIN
    }

    node "Conteneur seed (one-shot)" <<executionEnvironment>> as SEED {
      artifact "Dockerfile (builder, tsx)\nnpm run db:seed" as SEEDBIN
    }
  }

  folder "Volume nommé pgdata\n(/var/lib/postgresql/data)" as PGVOL
  folder "Volume ./uploads\n(imports, reports)" as UPVOL
  artifact "backend/.env (monté :ro)" as ENVFILE
}

cloud "Open-Meteo" as OM
cloud "GDACS / IBTrACS" as CYCLO
cloud "Google Gemini" as GEMINI

VITE --> API : HTTP — proxy /api et /health
API --> DB : TCP 5432 (postgres://…@db:5432/mada_risk)
DB ..> PGVOL : persiste
API ..> UPVOL : persiste
API ..> ENVFILE : lit (lecture seule)
MIG --> DB : applique les migrations
SEED --> DB : comptes, source météo, règles
MIG ..> SEED : après migration
API --> OM : HTTPS
API --> CYCLO : HTTPS
API --> GEMINI : HTTPS — assistant IA\n(flux SSE + function calling)

note bottom of DB
  Aucun port publié : la base Compose est isolée
  de l'hôte et du port 5432 local.
end note
@enduml
```

---

## 3. Intégration continue (GitHub Actions)

```plantuml
@startuml madarisk_deploiement_ci
title MadaRisk Map — Intégration continue (GitHub Actions)
skinparam shadowing false
skinparam componentStyle rectangle
left to right direction

node "Dépôt GitHub (Tsiaro06/madarisk)" <<device>> as REPO
node "Runner ubuntu-latest" <<executionEnvironment>> as RUNNER {

  node "Job backend-static" <<executionEnvironment>> as J1 {
    artifact "npm ci" as J1A
    component "eslint + tsc + tsc(tests) + prettier --check" as J1B
  }

  node "Job backend-unit" <<executionEnvironment>> as J2 {
    artifact "npm ci" as J2A
    database "Service postgis/postgis:16-3.4" as J2DB
    component "db:migrate + db:seed" as J2B
    component "vitest run tests/unit" as J2C
  }

  node "Job frontend" <<executionEnvironment>> as J3 {
    artifact "npm ci" as J3A
    component "oxlint + vitest + vite build" as J3B
  }
}

REPO --> RUNNER : push main / pull_request
J1 ..> J2 : needs (fail-fast)
J2 ..> J2DB : TCP 5432
J2 ..> J2B
J2B ..> J2C

note bottom of RUNNER
  Les tests d'intégration ne tournent pas en CI :
  ils dépendent du référentiel territorial
  (119 districts / 1579 communes) absent du dépôt.
end note
@enduml
```
