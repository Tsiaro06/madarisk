# Imports administratifs & matching

Comment charger des données administratives dans le référentiel SIG et les apparier aux territoires.

## Formats de fichiers acceptés

| Format | Description | Exemple |
|---|---|---|
| **GeoJSON** | `FeatureCollection`, propriétés extraites de chaque feature (`nom`, `code`, …) | `districts.geojson` |
| **JSON** | Tableau d'objets — ou objet contenant un tableau d'objets | `[ {"nom": "Maroantsetra", "code": "114"} ]` |
| **CSV** | Première ligne = en-têtes (`nom,code`) | `nom,code` |

Limites :
- Extension autorisée : `.geojson`, `.json`, `.csv` (champ `file` du `multipart/form-data`).
- **50 Mo** maximum (`MAX_FILE_SIZE_MB`).
- Champs optionnels au delà de `file` : `territoryType` (`DISTRICT` | `COMMUNE`), `sourceName`.
- Encodage ISO-8859-1/UTF-8 géré ; erreurs normalisées ligne par ligne.

## Cycle d'un import

```
POST /imports
   │  (upload + enregistrement des enregistrements, statut EN_COURS → TERMINE|ECHEC)
   ▼
POST /matching/run/:importId
   │  (appariement automatique, aucune auto-validation)
   ▼
  GET /matching          → revue des candidatures
  POST /matching/:id/approve  /  reject (notes obligatoires)
  POST /matching/manual-link  → liaison manuelle
```

- Statuts d'import : `BROUILLON | EN_COURS | TERMINE | ECHEC`.
- Statuts de candidature : `EN_ATTENTE | EN_AMBIGUITE…` — opérés ici comme `EN_ATTENTE | VALIDE | REJETE | AMBIGU`.

## Algorithme de matching

Par **priorité décroissante**, chaque enregistrement source est comparé aux territoires cibles (`targetType`) :

1. **Code administratif exact** → confiance `100`.
2. **Nom normalisé** (minuscules sans accents, mots-clés) → confiance `98`.
3. **Alias** existant (`aliases` — casse/orthographe dépréciées gérées manuellement) → confiance `96`.
4. **Similarité contrôlée** (distance d'édition / mots communs) → confiance `≥ 95` seulement si suffisamment discriminante.

### Règles de décision

- **Candidat unique** → proposition `EN_ATTENTE` (aucune validation automatique : la revue humaine reste obligatoire).
- **Plusieurs candidats** → `AMBIGU` ; aucune association automatique (résolution manuelle requise).
- **Aucun candidat** → non associé (`unmatched`) ; rejet ou liaison manuelle possibles.

## API

| Méthode | Route | Description |
|---|---|---|
| POST | `/imports` | Créer un import (multipart) — 201 |
| GET | `/imports` | Lister (filtres statut / type de fichier / type de territoire) |
| GET | `/imports/:id` | Détail |
| GET | `/imports/:id/errors` | Erreurs par ligne |
| POST | `/matching/run/:importId` | Lancer l'appariement |
| GET | `/matching` | Lister les candidatures (filtres `status`, `targetType`, `minConfidence`, `maxConfidence`) |
| POST | `/matching/:id/approve` | Valider |
| POST | `/matching/:id/reject` | Rejeter (`notes` 1-2000 requis) |
| POST | `/matching/manual-link` | Lier manuellement un enregistrement à un territoire (score 100, `VALIDE`) |
| GET | `/matching/statistics` | Répartition par statut et méthode |

### Corps de `POST /matching/manual-link`

```json
{
  "sourceRecordId": "uuid",
  "targetType": "DISTRICT",
  "districtId": "uuid",
  "createAlias": true,
  "alias": "Maroantsetra-centre"
}
```
(`districtId` **ou** `communeId` selon `targetType` ; `alias` utilisable si `createAlias`.)

## Bonnes pratiques

- Pré-nettoyer les fichiers (encodage UTF-8, noms compatibles avec les codes administratifs) pour limiter les erreurs/ambiguïtés.
- Lancer `run` une seule fois par import ; relancer après un rejet complet d'une candidature.
- Utiliser `manual-link` avec `createAlias` pour les orthographes récurrentes : les alias alimentent la règle 3 au prochain import.

## Sécurité & rôles

L'intégralité du préfixe est réservé aux rôles **ANALYSTE_SIG** et **SUPER_ADMIN** (middleware appliqué au niveau du routeur). Les fichiers uploadés sont stockés hors du serveur web (`uploads/imports`), jamais exécutés, et leur contenu est toujours désérialisé de manière contrôlée (zod).