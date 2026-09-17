# Rapport Phase D — Confirmations des 5 actions administratives restantes

Date : 17 septembre 2026
Périmètre : **frontend uniquement** — aucun fichier backend ni base de données modifié

---

## 1. Contexte et objectif

La Phase C avait remplacé les `window.confirm` par la modale accessible `AdministrativeActionConfirmDialog` pour 11 actions administratives. Cinq actions étaient volontairement restées sans modale :

1. Création d'un événement exceptionnel
2. Ajout d'un point de trajectoire
3. Relance du calcul de zone (bande tampon)
4. Définition d'une zone polygonale manuelle
5. Création d'une alerte exceptionnelle

La Phase D applique à ces 5 actions le **même composant** `AdministrativeActionConfirmDialog` (variante `warning`), sans ajouter de champ de motif, sans modifier les rôles/guards et sans toucher au backend. Objectif : aucune mutation ne part vers l'API avant validation explicite de l'utilisateur.

---

## 2. Fichiers créés

| Fichier | Rôle |
|---|---|
| `frontend/src/pages/EvenementsPage.test.tsx` | 10 tests : garde par rôle (CLIENT/ANALYSTE_SIG invisibles, ADMIN/SUPER_ADMIN visibles), ouverture de la modale sans appel API, résumé, Annuler = 0 appel, Confirmer = 1 appel, pending « Traitement en cours… », erreur 422 conservée, formulaire réinitialisé après succès. |
| `frontend/src/pages/AlertesPage.test.tsx` | 10 tests : mêmes scénarios pour la création d'alerte exceptionnelle (garde par rôle, modale, résumé, annulation, confirmation unique, pending, erreur, reset du formulaire). |
| `frontend/src/pages/EvenementDetailPage.test.tsx` | 10 tests couvrant les 3 actions de la page (point de trajectoire, recalcul de zone, zone polygonale) : garde par rôle, plusieurs points, annulation, confirmation unique, pending, erreur, et garde `polygonPoints.length < 3`. |

---

## 3. Fichiers modifiés

### EvenementsPage.tsx — « Créer un événement exceptionnel »
- Import de `AdministrativeActionConfirmDialog`
- État `confirmState` + `closeConfirm()`
- `requestCreate = form.handleSubmit((values) => setConfirmState({…}))` : le submit ouvre la modale (aucune mutation)
- Résumé : `Code · Nom · Type · Sévérité · Statut ·` synthèse de forme (`Trajectoire : n points` en cyclone, sinon `Zone polygonale : n points`)
- `onSubmit={requestCreate}` sur le formulaire (au lieu de `createM.mutate` direct)
- `closeConfirm()` ajouté dans `createM.onSuccess`
- Modale rendue en fin de composant avec `isPending={createM.isPending}`

### AlertesPage.tsx — « Créer une alerte exceptionnelle »
- Constante `EMPTY_ALERT_FORM` extraite ; `useState(EMPTY_ALERT_FORM)`
- `onCreate` ouvre la modale (résumé `Titre · Type · Sévérité`, plus `Événement / District / Commune` si renseignés) au lieu d'appeler `createM.mutate()`
- `closeConfirm()` **et** `setForm(EMPTY_ALERT_FORM)` ajoutés dans `createM.onSuccess` (formulaire réinitialisé)
- `isPending` de la modale étendu à `publishM.isPending || archiveM.isPending || createM.isPending`

### EvenementDetailPage.tsx — « Point de trajectoire », « Calcul de zone », « Zone polygonale »
- `closeConfirm()` ajouté aux `onSuccess` de `areaM`, `polygonM` et `trackM`
- Bouton « Ajouter le point » : ouvre la modale (résumé `Latitude · Longitude · Type`, contexte `Événement`), `onConfirm: () => trackM.mutate()`
- Formulaire « Bande tampon / Relancer le calcul de zone » : submit ouvre la modale (résumé `Phase · Niveau · Rayon (km)`), `onConfirm: () => areaM.mutate(v)`
- Bouton « Définir la zone (n points) » : garde frontend `if (polygonPoints.length < 3) return;` puis ouvre la modale (résumé `nombre de points`, sans coordonnées), `onConfirm: () => polygonM.mutate({…})`
- `isPending` de la modale étendu à `areaM.isPending || polygonM.isPending || trackM.isPending` (en plus des mutations Phase C)

---

## 4. Récapitulatif des décisions

### Confirmations ajoutées par la Phase D (5)
1. Création d'un événement exceptionnel — `warning`
2. Ajout d'un point de trajectoire — `warning`
3. Relance du calcul de zone (bande tampon) — `warning`
4. Définition d'une zone polygonale manuelle — `warning`
5. Création d'une alerte exceptionnelle — `warning`

### Couverture totale
- 11 confirmations (Phase C) + 5 (Phase D) = **16 actions administratives** protégées par la modale
- Plus aucune action administrative du flux ne déclenche de mutation directe sans confirmation

### Libellés de confirmation
- Création d'événement / d'alerte : « Confirmer la création »
- Point de trajectoire : « Confirmer l'ajout »
- Calcul de zone : « Confirmer le recalcul de zone »
- Zone polygonale : « Confirmer la zone polygonale »

### Comportement garanti
- Submit → ouverture de la modale, **aucun appel API**
- Annuler / Échap → fermeture, **aucun appel API**
- Confirmer → **exactement un** appel API
- Pendant la mutation : bouton désactivé + « Traitement en cours… » (anti double-clic, Échap bloqué)
- Succès → fermeture de la modale, toasts conservés, invalidation des queries TanStack, formulaire remis dans un état cohérent
- Erreur → modale maintenue, erreurs backend (422 `errors[]`) conservées, aucun succès prétendu

### Points de conformité
- `reason` / motif auditable non ajouté (absent côté API) : la traçabilité reste celle fournie par le système
- Guard `polygonPoints.length >= 3` conservé côté frontend, aucune modification de la logique Leaflet
- Aucun rôle, guard, endpoint, composant ni design modifié

---

## 5. Validations

| Commande | Résultat |
|---|---|
| `npm test` (`vitest run`) | **70/70 tests passés** sur 9 fichiers (40 existants + 30 nouveaux Phase D) |
| `npm run lint` (oxlint) | **0 erreur** (warnings pré-existantes, non liées à la Phase D) |
| `npm run build` (`tsc -b && vite build`) | **Build réussi** |

### Note technique (tests)
Le composant `Input` rend son message d'erreur **à l'intérieur** du `<label>` englobant : après une erreur 422, le texte du label devient `"Code" + message` et le `getByLabelText('Code')` exact échoue. Les tests utilisent donc une correspondance par expression régulière (`getByLabelText(/^Code/)`).

---

## 6. Note sur Git

Les modifications Phase 9 (backend + frontend sécurité/UX), Phase B, Phase C et **Phase D** (frontend) sont présentes en working tree, **non commitées**. Le commit peut être fait dès validation ou attendre les préférences.

---

*Rapport Phase D généré le 17 septembre 2026. Aucun fichier backend ni base de données n'a été modifié.*
