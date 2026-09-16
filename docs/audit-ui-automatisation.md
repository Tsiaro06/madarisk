# Rapport Phase B — Adaptation UI au fonctionnement automatisé

Date : 15 septembre 2026
Périmètre : **frontend uniquement** — aucun fichier backend ni base de données modifié

---

## 1. Contexte et objectif

Les fonctionnalités d'automatisation de MadaRisk Map sont terminées : synchronisation météo, détection automatique des aléas, création/mise à jour auto des événements, calcul auto des zones exposées/communes exposées/risques, génération/mise à jour auto des alertes.

L'interface, encore orientée CRUD manuel, a été adaptée au fonctionnement automatisé selon le parcours cible :

```
Surveiller → Filtrer → Consulter → Comprendre → Voir sur la carte → Consulter le bilan
```

Toutes les actions manuelles ont été relogées dans une section **« Intervention administrative »** (visible uniquement pour les rôles autorisés).

---

## 2. Fichiers créés

| Fichier | Rôle |
|---|---|
| `frontend/src/components/admin/AdministrativeInterventionPanel.tsx` | Panneau réutilisable « Intervention administrative » (géré par `canManageOps` — ADMIN/SUPER_ADMIN uniquement), accordéon replié par défaut, sous-titre, avertissement, note traçabilité ; mode `compact` pour actions en ligne. |
| `frontend/src/components/ui/RefreshDataButton.tsx` | Bouton « Actualiser les données » basé sur `useIsFetching` (refetch lecture seule, aucun écriture). |

---

## 3. Fichiers modifiés

### CrisisHeader.tsx
- Props `canCreate` / `onOpenCreate` supprimées, import `Plus` retiré
- Bouton « Créer un événement » retiré (2 blocs dupliqués supprimés)
- « Actualiser maintenant » → « Actualiser les données » (comportement refetch conservé)

### CrisisRoomPage.tsx
- Invocation `CrisisHeader` sans `canCreate` / `onOpenCreate`
- État vide mis à jour (création = exception administrative)
- Asides desktop (`lg:flex`) et mobile wrappés `flex-col` avec `AdministrativeInterventionPanel` en bas contenant bouton **« Créer un événement exceptionnel »** (ouvre `CreateEventModal` via `setCreateOpen`), affiché si `canManageOps(role)`

### EvenementsPage.tsx
- Titre → **« Événements détectés automatiquement »**
- Sous-titre : « Suivez les aléas détectés, leurs zones d'exposition et leur évolution. »
- Ligne sync : « Surveillance automatique active · Dernière mise à jour : {date} · Source : {source} » (calculée depuis `listQ.data.data` ; texte par défaut si absent)
- `RefreshDataButton` ajouté (queryKey `['events']`)
- « Nouvel événement » masqué du flux
- `AdministrativeInterventionPanel` avec **« Créer un événement exceptionnel »** en bas de page
- Modal renommée (titre + aria-label « Créer un événement exceptionnel »)
- EmptyState mis à jour (« Aucun événement pour le moment. Les aléas sont normalement détectés et suivis automatiquement. »)

### EvenementDetailPage.tsx
- Recap « Parcours de gestion » en lecture seule (badges « Étape n/4 » / « Parcours terminé » + note « Ce parcours est maintenant géré automatiquement… »)
- Carte read-only : hint « Carte en lecture seule — les zones d'influence et zones d'exposition sont calculées automatiquement… » ; zones sans bouton Supprimer ; barre de retrait commune supprimée du flux
- Tableau « Communes exposées » sans colonne Actions
- `AdministrativeInterventionPanel` ajouté en bas de l'onglet **Opérations** contenant :
  - Cycle de vie (STATUSES, `window.confirm` avant chaque mutation)
  - Point de trajectoire (formulaire)
  - Bande tampon → **« Relancer le calcul de zone »**
  - Polygone (dessin)
  - **« Relancer le calcul d'exposition »**
  - **« Relancer le calcul des risques »** (confirm)
  - Retrait commune exposée (sélection sur carte + `select`)
  - **« Supprimer une zone erronée »**
  - **« Retirer une commune exposée erronée »** (sélection par ID)
- Confirmations améliorées : « Cette action retire une donnée du résultat automatique… »
- Import `canManageOps` retiré (plus utilisé)

### AlertesPage.tsx
- Titre → **« Alertes générées automatiquement »**
- Sous-titre : « Consultez les vigilances, alertes actives et alertes archivées produites par la surveillance automatique. »
- Ligne sync : « Surveillance automatique active · Dernière mise à jour : {max date} »
- `RefreshDataButton` ajouté (queryKey `['alerts']`)
- Filtres visuels par statut : **Toutes / Alertes actives / Préparation / Archives**
- « Nouvelle alerte » masqué
- **Par ligne** : Publier / Archiver dans `AdministrativeInterventionPanel` compact (confirm avant chaque action)
- **En bas de page** : panneau admin avec **« Créer une alerte exceptionnelle »** + note explicative
- Modal renommée (titre + aria-label « Créer une alerte exceptionnelle »)

### RisquesPage.tsx
- Sous-titre → **« Évaluation automatique des risques par commune et par événement »**
- Ligne sync : « Surveillance automatique active · Informations de synchronisation non disponibles. »
- `RefreshDataButton` ajouté (queryKey `['risks']`)
- Carte « Recalculer les risques » retirée du flux principal → **AdministrativeInterventionPanel** avec bouton **« Relancer le calcul des risques »** (formulaire phase + événement conservé)

### RightPanel.tsx
- Rafraîchissement météo → panneau compact **« Relancer la synchronisation de cette commune »** (confirm)
- Recalcul risque → panneau compact **« Relancer le calcul des risques »** (sélect phase conservé, confirm)
- Bouton « Exporter en CSV » gaté `ADMIN/SUPER_ADMIN` uniquement (alignement UI/backend)
- Import `AdministrativeInterventionPanel` ajouté

### WeatherControls.tsx
- Props `canRefresh` / `isRefreshing` retirées du composant (panneau gère l'affichage)
- Bouton rafraîchissement → panneau compact : **« Relancer la synchronisation de ce district »** / **« Relancer la synchronisation nationale »** (selon `districtId`)

### WeatherMapPage.tsx
- Sous-titre adapté : « Observations et prévisions par commune — alimentées automatiquement par la surveillance »
- Bouton **« Actualiser les données »** ajouté dans le header (refetch couche météo + communes + monitoring)
- `handleRefresh` : `window.confirm` ajouté avant chaque relance
- Textes progress/toast renommés : « Synchronisation du district… », « Synchronisation des données météo terminée. »

### RapportsPage.tsx
- Card « Exporter » remplacée par **AdministrativeInterventionPanel** avec titre **« Exports manuels (intervention) »**
- Texte ajouté : « Les rapports automatiques sont disponibles dans l'historique. Utilisez ces exports pour une extraction ponctuelle ou une analyse administrative. »

### AppShell.tsx
- « Dashboard » → **« Salle de crise »**
- « Événements » → **« Événements détectés »**
- « Risques » → **« Risques (évaluation auto.) »**
- « Alertes » → **« Alertes automatiques »**
- Imports / Matching / Administration / Config. risque conservés et non masqués

### ForbiddenPage.tsx / NotFoundPage.tsx
- « Retour au dashboard » → **« Retour à la salle de crise »**

---

## 4. Récapitulatif des décisions

### Actions déplacées dans « Intervention administrative » (14)
1. Création événement (CreateEventModal)
2. Cycle de vie statuts (BROUILLON → CLOTURE)
3. Ajout point de trajectoire
4. Calcul de zone (bande tampon)
5. Dessin zone polygonale
6. Calcul d'exposition
7. Recalcul des risques (par événement + global)
8. Suppression de zone erronée
9. Retrait de commune exposée erronée (carte + select)
10. Création d'alerte exceptionnelle
11. Publication d'alerte (BROUILLON → PUBLIEE)
12. Archivage d'alerte
13. Rafraîchissement météo (commune / district / national)
14. Exports manuels (CSV / GeoJSON / PDF)

### Actions renommées (10)
- « Actualiser maintenant » → « Actualiser les données »
- « Créer un événement » → « Créer un événement exceptionnel »
- « Nouvelle alerte » → « Créer une alerte exceptionnelle »
- « Calculer » → « Relancer le calcul de zone »
- « Calculer exposition » → « Relancer le calcul d'exposition »
- « Recalculer les risques » → « Relancer le calcul des risques »
- « Supprimer » (zone) → « Supprimer une zone erronée »
- « Retirer » (commune) → « Retirer une commune exposée erronée »
- « Rafraîchir ce district » → « Relancer la synchronisation de ce district »
- « Rafraîchir tout le pays » → « Relancer la synchronisation nationale »
- Card « Exporter » → « Exports manuels (intervention) »

### Actions gardées inchangées (11)
- Dashboard (lecture seule)
- Navigation (AppShell)
- « Activer en crise » (store local)
- Exports du bilan (PDF/CSV/GeoJSON — EventBilanTab, déjà admin-only)
- « Télécharger » rapport historique
- Imports / Matching (ANALYSTE_SIG / SUPER_ADMIN)
- Administration utilisateurs (SUPER_ADMIN)
- Config. risque (SUPER_ADMIN)
- Mot de passe
- Territoires (consultation)
- Chronologie (lecture seule)

### Données API manquantes (non déplaçables sans backend)
- Champ `source` / `lastUpdated` des événements automatiques pas encore systématiquement exposé → texte par défaut « Informations de synchronisation non disponibles. » affiché si absent
- Motif auditable (`reason`) d'intervention non disponible côté API → confirmations `window.confirm` avec message d'avertissement ; extension backend nécessaire pour un vrai champ de journalisation

---

## 5. Validations

| Commande | Résultat |
|---|---|
| `npm run lint` (oxlint) | **0 erreur** (8 warnings pré-existantes, non liées à Phase B) |
| `npm run build` (`tsc -b && vite build`) | **Build réussi** (tsc 0 erreur) |
| `npx vitest run` | **14/14 tests passés** (RightPanel, LeftPanel, CrisisMap — aucune régression) |

---

## 6. Liste des fichiers modifiés (récapitulatif)

```
frontend/src/components/admin/AdministrativeInterventionPanel.tsx   ← CREAT
frontend/src/components/ui/RefreshDataButton.tsx                    ← CREAT
frontend/src/components/crisis/CrisisHeader.tsx
frontend/src/components/crisis/RightPanel.tsx
frontend/src/components/weather/WeatherControls.tsx
frontend/src/components/layout/AppShell.tsx
frontend/src/pages/CrisisRoomPage.tsx
frontend/src/pages/EvenementsPage.tsx
frontend/src/pages/EvenementDetailPage.tsx
frontend/src/pages/AlertesPage.tsx
frontend/src/pages/RisquesPage.tsx
frontend/src/pages/WeatherMapPage.tsx
frontend/src/pages/RapportsPage.tsx
frontend/src/pages/ForbiddenPage.tsx
frontend/src/pages/NotFoundPage.tsx
```

---

# Rapport Phase C — Confirmations administratives (modale accessible)

Date : 16 septembre 2026
Périmètre : **frontend uniquement** — aucun fichier backend ni base de données modifié

---

## 1. Contexte et objectif

Les `window.confirm` utilisés comme confirmations des actions administratives (Phase B) n'offraient aucune accessibilité ni consistance visuelle. Ils ont été remplacés par une modale réutilisable et accessible : **`AdministrativeActionConfirmDialog`**.

---

## 2. Fichiers créés

| Fichier | Rôle |
|---|---|
| `frontend/src/components/ui/AdministrativeActionConfirmDialog.tsx` | Modale de confirmation réutilisable : `role="dialog"` + `aria-modal`, focus initial, piège de focus (Tab), fermeture Échap (bloquée pendant mutation), bouton de confirmation désactivé pendant l'action (« Traitement en cours… »), 3 variantes (`warning` ambre / `destructive` rouge / `primary` bleu), textes d'avertissement et de traçabilité, langue française. |
| `frontend/src/components/ui/AdministrativeActionConfirmDialog.test.tsx` | 14 tests du composant (ouverture/fermeture, textes, variantes, focus, Échap, pending, libellés par défaut). |
| `frontend/src/components/admin/AdministrativeInterventionPanel.test.tsx` | 5 tests de garde : panneau invisible pour CLIENT/ANALYSTE_SIG, actions visibles + panneau ouvrable pour ADMIN/SUPER_ADMIN. |
| `frontend/src/components/crisis/RightPanel.admin.test.tsx` | 7 tests d'intégration : garde par rôle, ouverture de la modale, Annuler = 0 appel API, Confirmer = exactement 1 appel, pending désactivé, recalcul des risques = 1 appel. |

---

## 3. Fichiers modifiés

### EvenementDetailPage.tsx (6 confirmations)
- Changement de statut (cycle de vie) → modale `warning`, contexte Phase
- « Relancer le calcul d'exposition » → modale `warning`
- « Relancer le calcul des risques » (+ changement de phase) → modale `warning`, contexte Phase
- Retrait commune exposée (carte + sélecteur) → modale `destructive`, contexte Commune
- « Supprimer une zone erronée » → modale `destructive`, contexte Zone
- `closeConfirm()` ajouté aux `onSuccess` de `statusM`, `exposureM`, `risksM`, `deleteAreaM`, `removeExposedM` ; `setSelectedMapCommune(null)` déplacé dans `onSuccess` de `removeExposedM`

### AlertesPage.tsx (2 confirmations)
- Publication d'alerte → modale `warning`
- Archivage d'alerte → modale `destructive`
- `publishAlert` / `archiveAlert` ouvrent la modale ; `closeConfirm()` dans les `onSuccess` de `publishM` / `archiveM`

### WeatherMapPage.tsx (1 confirmation)
- « Relancer la synchronisation » → modale `warning` via le nouveau `requestRefresh` branché sur `onRefresh` de `WeatherControls` ; `handleRefresh` dépouillé du `window.confirm` ; `closeConfirm()` dans le `finally`

### RightPanel.tsx (2 confirmations)
- « Relancer la synchronisation de cette commune » → modale `warning`
- « Relancer le calcul des risques » → modale `warning`, contexte Commune
- `closeConfirm()` dans les `onSuccess` de `refreshM` / `recalcM`

### vitest.config.ts
- `pool: 'threads'` ajouté : le pool par défaut `forks` provoque des timeouts de worker sur Windows + Node v24.15.0

### package.json
- `@testing-library/user-event` ajouté en devDependency (interactions utilisateur réalistes dans les tests)

---

## 4. Récapitulatif des décisions

### Confirmations administrées par la modale (11)
1. Changement de statut d'un événement (cycle de vie)
2. Relance du calcul d'exposition
3. Relance du calcul des risques (événement)
4. Retrait d'une commune exposée erronée (carte)
5. Retrait d'une commune exposée erronée (sélecteur)
6. Suppression d'une zone erronée
7. Publication d'alerte
8. Archivage d'alerte
9. Relance de la synchronisation météo (WeatherMapPage)
10. Relance de la synchronisation météo (RightPanel)
11. Recalcul des risques (RightPanel)

### Actions administratives sans modale (5) — inchangées par conformité « ne pas ajouter de nouvelles actions »
- Création d'un événement exceptionnel
- Ajout d'un point de trajectoire
- Relance du calcul de zone (bande tampon)
- Dessin d'une zone polygonale
- Création d'une alerte exceptionnelle

### Design de la modale
- Variantes : `warning` (synchronisations, recalculs, publications, changements de statut) ; `destructive` (suppressions, retraits, archivage) ; `primary` (autres actions non destructives)
- Valeurs par défaut : « Annuler » / « Confirmer l'intervention »
- Configurable : `title`, `description`, `actionLabel`, `cancelLabel`, `isPending`, `onConfirm`, `onOpenChange` + contexte optionnel (événement, commune, zone, alerte…)
- Textes fixes : « Cette action exceptionnelle peut modifier des données générées automatiquement. Vérifiez la source avant de continuer. » et « Cette intervention est soumise à la traçabilité disponible côté système. »
- Accessibilité : `role="dialog"`, `aria-modal`, focus sur l'ouverture, piège de focus, Échap, anti double-clic
- Flux : fermeture + invalidation des queries TanStack sur succès (toasts conservés) ; message backend affiché en cas d'échec

### Données API manquantes (inchangées)
- Pas de champ backend `reason` / justification auditable : aucune saisie de motif n'est prétendue dans la modale ; la traçabilité reste celle fournie par le système (toasts, logs backend)

---

## 5. Validations

| Commande | Résultat |
|---|---|
| `npm run lint` (oxlint) | **0 erreur** (9 warnings pré-existantes, non liées à la Phase C) |
| `npm run build` (`tsc -b && vite build`) | **Build réussi** |
| `npx vitest run` | **40/40 tests passés** (14 existants + 26 nouveaux) |

---

## 6. Note sur Git

Les modifications Phase 9 (backend + frontend sécurité/UX), **Phase B** **et Phase C** (frontend) sont présentes en working tree, **non commitées**. Le commit peut être fait dès validation ou attendre les préférences.

---

*Rapport Phase C généré le 16 septembre 2026. Aucun fichier backend ni base de données n'a été modifié.*
