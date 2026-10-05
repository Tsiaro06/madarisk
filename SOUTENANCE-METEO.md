# Guide de démarrage — soutenance (page Météo)

**Soutenance : mardi 6 octobre 2026 à 08h00.**
Ce document décrit exactement quoi lancer, quand, et quoi ne pas faire.

Ports : backend `5000` · frontend `5173` · PostgreSQL `5432`.

---

## 1. Règle d'or

> **Si la page Météo n'affiche aucun bandeau orange « Données météo
> potentiellement périmées », tout va bien. Ne cliquez rien.**

Les observations se resynchronisent **seules** toutes les 6 h. Un clic manuel sur
« Relancer la synchronisation nationale » consomme 1 579 appels sur un budget
quotidien de 9 000 : inutile, il rend le risque de panne plus grand, pas plus petit.

---

## 2. Ce que le système fait tout seul

Au démarrage du backend, si les données sont périmées, une synchronisation de
rattrapage part immédiatement, sans intervention :

| Mécanisme | Déclencheur |
|---|---|
| Rattrapage au démarrage | observations > **8 h**, ou prévisions > **26 h** |
| Cron observations | toutes les 6 h (`0 */6 * * *`) |
| Cron prévisions | 1×/jour à 12h20 (`20 12 * * *`) |
| Auto-réparation après veille | le backend détecte le gel de l'horloge et relance |

Conditions nécessaires, déjà vérifiées dans `backend/.env` :

```
ENABLE_SCHEDULED_JOBS=true      ← sinon AUCUNE synchro automatique
DEMO_MODE non défini             ← sinon données simulées, à proscrire
NODE_ENV=development
```

Portez attention : un seul de ces deux réglages faux suffit à tout casser.

---

## 3. Ce que vous ne devez PAS faire

| ❌ Interdit | Pourquoi |
|---|---|
| Activer `DEMO_MODE=true` | Les données deviennent **simulées** (`raw_data.simulation = true`, source `SIMULATION`). Un jury qui ouvre l'API le voit. |
| Relancer la synchronisation nationale « pour être sûr » | Coûte 1 579 appels sur 9 000. Le rattrapage automatique fait le même travail. |
| Lancer une synchronisation à 07h55 | Elle dure 3 à 4 min. Si elle échoue, vous présentez avec une carte vide. |
| Modifier `OPEN_METEO_DAILY_BUDGET` | Le maximum est 10 000 (limite du service gratuit). Ne pas le monter au-delà. |
| Ouvrir `/weather/monitoring` dans un onglet sans jeton | Il faut être authentifié, sinon on ne voit pas l'ancienneté. |

---

## 4. Planning

### Ce soir (J-1) — 10 minutes

1. **Laissez le backend allumé** et **désactivez la mise en veille du PC**.
   C'est le scénario le plus sûr : le cron de 06h00 fait le travail tout seul et
   vous n'avez rien à lancer demain matin.
   - Si le PC se met quand même en veille, pas de panique : le backend détecte le
     retour (`weather-refresh.job.ts:110`) et relance seul dans la minute.
   - Si vous **préférez** arrêter le backend ce soir, ça marche aussi (voir §4.2).
2. Ouvrez `http://localhost:5173/meteo` une fois et vérifiez que tout s'affiche :
   carte colorée, un clic sur une commune ouvre un panneau avec des valeurs.
3. **Arrêtez là.** Ne lancez rien d'autre.

### 4.2 Option : backend arrêté cette nuit

Dans ce cas, dernier run à 18h00 → le lendemain à 06h45 les observations ont
12 h 45, donc **dépassent le seuil de 8 h** → le rattrapage part au boot, et vous
avez des données fraîches vers 06h50.

### 4.3 Demain matin (J)

| Heure | Action | Durée |
|---|---|---|
| **06h30** | Ouvrir le PC, vérifier que PostgreSQL tourne : `Get-Service postgresql-x64-16` doit afficher `Running`. | 1 min |
| **06h40** | Si le backend n'est pas déjà lancé : `cd D:\MadaRisk\backend` puis `npm run dev`. Attendre `🚀 MadaRisk API démarrée sur http://localhost:5000`. Si le backend tournait cette nuit, **ne rien faire**. | 1 min |
| **06h45** | Regarder les logs backend. Si le rattrapage part, vous verrez `Job météo : données périmées, synchronisation de rattrapage`. Comptez **3 à 4 minutes**. | — |
| **06h50** | `cd D:\MadaRisk\frontend` puis `npm run dev`. | 1 min |
| **06h55** | Ouvrir `http://localhost:5173/login` — compte : `admin@madarisk.mg` / `Admin@123!` | 2 min |
| **07h00** | Aller sur `/meteo` et passer la checklist du §5. | 5 min |
| **07h10** | **Arrêter de toucher à l'ordinateur.** | — |

Vous avez donc **50 minutes de marge** avant la soutenance.

> Si vous utilisez Docker plutôt que PostgreSQL local :
> `cd D:\MadaRisk\backend` puis `docker compose --profile db up -d db`
> (le service `db` est dans un profil, `--profile db` est obligatoire).

---

## 5. Checklist avant la soutenance

Cochez chaque point sur `/meteo` :

- [ ] **Aucun bandeau orange** « Données météo potentiellement périmées » en haut de la carte.
- [ ] La carte est **colorée** (pas une grille de polygones tous blancs).
- [ ] Un **clic sur une commune** ouvre le panneau de droite avec des valeurs chiffrées.
- [ ] Le panneau affiche une **« Date de donnée »** du jour ou de la veille.
- [ ] Le bouton de recherche en haut à gauche de la carte fonctionne : tapez
      2 lettres, une liste de communes apparaît, cliquez → la carte se recentre.
- [ ] Le sélecteur de district (à gauche) filtre bien la carte.

**Un seul point en échec ?** Faites le §9.

---

## 6. Les trois boutons de la page Météo

| Bouton | Ce qu'il fait réellement | Coût | Quand l'utiliser |
|---|---|---|---|
| **Actualiser les données** (header) | Relit l'API. Aucun appel externe, aucune écriture. | **0** | Onglet resté ouvert longtemps |
| **Rechercher une commune** (sur la carte) | Recherche par nom puis recentrage. | **0** | Naviguer vers une commune |
| **Relancer la synchronisation** (panneau Filtres) | Va chercher les observations chez le fournisseur, écrit en base. | **1 579** | **Uniquement** si le bandeau de péremption est affiché |

Les deux premiers sont sans risque. Le troisième ne l'est pas : il est réservé
aux rôles `ADMIN` / `SUPER_ADMIN` et protégé par une confirmation.

---

## 7. Observations ou prévisions : que peut-on montrer ?

Le badge en haut de la page indique le mode courant :

| Mode | Comment l'obtenir | Disponibilité le jour J |
|---|---|---|
| **OBSERVATION** | date = aujourd'hui, aucune heure sélectionnée (par défaut) | Mesures réelles jusqu'à ~1 h |
| **PREVISION** | date = aujourd'hui **+ une heure sélectionnée**, ou date = demain | Courbe horaire : J et J+1 |
| **HISTORIQUE** | date = aujourd'hui **− 1** | Réanalyse des 48 h précédentes |

Pour les **prévisions de demain** pendant la soutenance : laissez la date sur
« aujourd'hui » et **sélectionnez une heure** dans les contrôles — le badge
bascule en `PREVISION` et le panneau affiche la courbe horaire, partie observée
et partie prévisionnelle.

L'horizon maximal est **J+3** pour les dates, **J+1** pour la courbe horaire.
Au-delà, il n'y a rien : ce n'est pas un bug, le fournisseur n'en renvoie pas.

---

## 8. Combien de fois je peux relancer la synchronisation ?

Le budget est **journalier**, il ne se vide pas d'un coup à l'ouverture.

| Moment de la journée | Relances nationales possibles |
|---|---|
| Juste après 03h00 (remise à zéro du compteur) | **jusqu'à ~5** |
| Milieu de journée | 2 à 3 |
| Après les crons de 06h / 12h / 18h | **0** |

Total automatique consommé par les crons : **7 895 appels** sur 9 000.
Si vous ne lancez qu'une seule relance manuelle, faites-la **tôt le matin**,
et jamais juste avant de présenter.

---

## 9. Diagnostic des problèmes

### Le bandeau « Données météo potentiellement périmées » est affiché

C'est le seul cas qui justifie une action. Dans le panneau **Filtres** →
**Relancer la synchronisation nationale** → **Confirmer la synchronisation** →
attendre 3 à 4 minutes. Le texte de progression s'affiche sous le bouton.
À 07h00 le quota est largement disponible.

### La carte est vide ou tous les polygones sont blancs

1. Attendez la fin d'un éventuel run en cours (bouton *Relance…* / message de
   synchronisation en cours).
2. Vérifiez les logs backend : une erreur réseau ou un quota épuisé y apparaît.
3. Vérifiez le filtre district : s'il est positionné sur un district, la carte
   n'affiche que ce district.

### Erreur « Impossible de charger la couche météo pour ces paramètres »

Problème de connexion frontend → backend. Vérifiez que le backend écoute bien
sur le port 5000 et que le proxy Vite fonctionne.

### La recherche de commune ne renvoie rien

- Il faut **au moins 2 caractères** (la requête est debouncée à 280 ms).
- La recherche porte sur le **nom** de la commune, pas sur un code.

### Rien ne fonctionne et il est 07h55

Ne lancez pas une synchronisation à la dernière minute. Présentez les autres
pages (`/dashboard`, `/territoires`, `/risques`) et Traithez le sujet météo en
expliquant le fonctionnement — c'est un contenu de soutenance valide.

---

## 10. Questions probables du jury

**« Les données sont-elles réelles ou simulées ? »**

Réelles, sauf si `DEMO_MODE=true` (à proscrire). Elles proviennent d'Open-Meteo,
qui sert l'analyse du modèle européen ECMWF. **Attention à la nuance** : ce ne
sont pas les relevés des pluviomètres de Météo Madagascar, et la résolution
spatiale est d'environ 9 à 11 km. Une commune peut afficher 12 mm alors qu'un
pluviomètre à Antananarivo en a mesuré 4. Ne présentez donc jamais une valeur
chiffrée pour une commune comme une mesure au sol.

**« Quelle est la source ? »**

⚠️ **Point d'attention** : la mention de la source a été retirée de l'interface
le 5 octobre 2026 (bandeau du header et ligne « Source » des panneaux). Répondez
de mémoire : **Open-Meteo**, `https://open-meteo.com`, observations horaires et
prévisions à 3 jours. Si vous préférez l'afficher, la ligne à rétablir est dans
`WeatherCommuneDetailsPanel.tsx` (bloc « Date de donnée »), qui est le bon
endroit — laBanner du header est moins bonne.

**« À quelle fréquence les données sont-elles mises à jour ? »**

Tous les 6 heures pour les observations (limite du quota gratuit), une fois par
jour pour les prévisions. Le panneau de gauche affiche la date des dernières
observations et de la dernière synchronisation.

**« Que se passe-t-il si le fournisseur est indisponible ? »**

Les forecasts déjà enregistrées en base restent affichées, un bandeau le signale,
et un circuit ouvert évite de consommer inutilement le quota pendant plusieurs
heures.

---

## 11. Annexe — où tout se trouve dans le code

| Sujet | Fichier |
|---|---|
| Démarrage des jobs | `backend/src/server.ts:44-50` |
| Rattrapage au démarrage | `backend/src/jobs/weather-refresh.job.ts:140` |
| Seuils de péremption | `backend/src/jobs/weather-refresh.job.ts:28-50` |
| Crons | `backend/src/jobs/weather-refresh.job.ts:133-138` |
| Compteur de quota | `backend/src/services/weather-quota.ts:52-54, 128-154` |
| Écriture des observations | `backend/src/services/weather-sync.service.ts:421-430` |
| Relance manuelle (nationale) | `backend/src/services/weather.service.ts:165-189` |
| Suivi de la relance | `frontend/src/pages/WeatherMapPage.tsx:209-315` |
| Bandeau de péremption | `frontend/src/pages/WeatherMapPage.tsx:459-464` |
| Mode observation / prévision | `frontend/src/services/weather.service.ts:143-152` |
| Recherche de commune | `frontend/src/components/crisis/CommuneMapSearch.tsx` |
| Repli après veille | `backend/src/jobs/weather-refresh.job.ts:110-126` |