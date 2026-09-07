# Moteur de risque

Cette page documente le calcul du risque par commune, la configuration des poids/seuils et les API associées.

## Principe

Chaque commune reçoit un **score de risque** `0..100` issu d'une pondération de cinq facteurs normalisés (`0..100` chacun) :

| Facteur | Approximation | Poids par défaut |
|---|---|---|
| **Pluie** | Intensité de la dernière observation / prévision météo | `0.30` |
| **Vent** | Vitesse du vent (rafales moyennes) | `0.25` |
| **Proximité** | Distance de la commune à la zone d'influence d'un événement | `0.20` |
| **Vulnérabilité** | Score de vulnérabilité du territoire (données SIG) | `0.15` |
| **Exposition** | Population / ménages exposés par l'événement | `0.10` |

```
score = round(0.30*pluie + 0.25*vent + 0.20*proximite + 0.15*vulnerabilite + 0.10*exposition)
```

> Les poids **et** les seuils sont **configurables** via `risk-configurations` (la règle est : somme des poids = 1, seuils strictement croissants, tous dans `0..100`). La configuration active est utilisée par défaut ; un événement peut référencer une configuration spécifique.

## Niveaux

Le score est traduit en niveau (responsiver `displayLevel`/`color` pour Leaflet) :

| Score | Niveau | Couleur |
|---|---|---|
| `0 .. < 20` | `FAIBLE` | verte |
| `20 .. < 40` | `MODERE` | jaune |
| `40 .. < 60` | `ELEVE` | orange |
| `≥ 60` | `EXTREME` | rouge |

(Seuils par défaut `20 / 40 / 60 / 80` — modifiables dans une configuration.)

## Contextes d'évaluation

- **Global** : calcul sur toutes les communes d'un district ou du pays (risque « météo » seul).
- **Événementiel** : risque d'une commune **dans le contexte d'un événement** (combinaison météo + proximité de la zone d'influence + exposition).
- **Par phasze de crise** : `AVANT | PENDANT | APRES | RETABLISSEMENT` — le calcul de certains facteurs (exposition, priorité) dépend de la phase.

Les évaluations sont **horodatées** ; l'historique est conservé (`risk_evaluations`) pour permettre le suivi dans le temps.

## API

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| POST | `/risks/recalculate` | ADMIN/SUPER_ADMIN | Recalculer — `phase` requis ; périmètre `eventId?`/`communeIds?`/`districtId?` |
| GET | `/risks/communes/:communeId` | connecté | Évaluation — `eventId?`, `latest?` |
| GET | `/risks/priority-communes` | connecté | Classement — `eventId?`, `districtId?`, `riskLevel?`, `limit` (1-100, défaut 20) |
| GET | `/risks/map-layer` | connecté | Couche GeoJSON — `districtId?`, `eventId?`, `riskLevel?`, `phase?` |
| GET | `/risk-configurations` | connecté | Configurations |
| GET | `/risk-configurations/:id` | connecté | Détail |
| POST | `/risk-configurations` | SUPER_ADMIN | Créer (idempotence par `name` ; défauts sains si absents) |
| PATCH | `/risk-configurations/:id` | SUPER_ADMIN | Modifier (contraintes poids/seuils) |

### Priorité

`priority-communes` retourne les communes triées par score décroissant (et, à égalité, par population décroissante), avec le niveau calculé et le `displayLevel` lisible. Vus dans `dashboard/priority-communes` avec une réponse consolidée.

## Couche cartographique

`/risks/map-layer` renvoie une `FeatureCollection` où chaque feature = une commune avec `properties` : `communeId`, `commune`, `districtId`, `district`, `riskScore`, `riskLevel`, `displayLevel`, `color`, `phase`, et la météo pertinente (`rainMm`, `windKmh`). Consommation directe par Leaflet.

## Détermination en pratique

La priorité est donnée à l'**événement le plus récent actif `ACTIF`/`SUIVI`** pour le contexte (zone d'influence). Lorsqu'aucun événement n'est ciblé, le calcul repose sur la météo + vulnérabilité (phase « veille »). Les recalculs sont idempotents et ne suppriment jamais l'historique existant.