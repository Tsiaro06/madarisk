# Audit UI — MadaRisk Map (adaptation à l'automatisation)

Date : 15 septembre 2026
Périmètre : **frontend uniquement** (aucun fichier modifié — rapport en lecture seule)

---

## 1. Résumé de ce qui a été fait

Contexte : les fonctionnalités d'automatisation de MadaRisk Map sont terminées (synchronisation météo automatique, détection automatique des aléas, création/mise à jour automatique des événements, calcul automatique des zones exposées / communes exposées / risques, génération et mise à jour automatique des alertes, mise à jour automatique du dashboard et de la carte, suivi / évaluation / clôture automatiques).

Objectif de cette étape : adapter l'interface existante, encore orientée CRUD manuel, au fonctionnement automatique — **sans rien modifier**. Analyse en lecture seule uniquement.

### Actions réalisées
1. Recensé toutes les interfaces et actions encore orientées création / modification / suppression / déclenchement manuels.
2. Croisé chaque action avec sa visibilité par rôle (`canManageOps`, `canManageUsers`, `canManageImports`, `canManageRiskConfig`, « tous ») et l'endpoint backend réellement appelé (`src/api/index.ts` + vérification dans `openapi.yaml`).
3. Vérifié les pages : Dashboard, Événements, Détail événement, Alertes, Risques, Météo, Rapports, Administration, Imports, Matching, Config. risque, Territoires, Salle de crise.
4. Vérifié les composants : CrisisHeader, CreateEventModal, LeftPanel, RightPanel, EventBilanTab, EventChronologieTab, AppShell, guards (RequireAuth / RequireRole).
5. Vérifié les routes et guards de rôles (`routes/AppRouter.tsx`, `lib/roles.ts`).
6. Émis une décision pour chaque action en visant le parcours cible :

```text
Surveiller → Filtrer → Consulter → Comprendre → Voir sur la carte → Consulter le bilan
```

Les actions manuelles éventuelles doivent être relogées dans une section **« Intervention administrative »** (visible uniquement pour les rôles autorisés), réservée aux exceptions : correction, relance contrôlée, invalidation ou création manuelle exceptionnelle.

> **Aucune modification n'a été effectuée ni ne sera faite avant validation explicite.**

---

## 2. Tableau d'audit

| Page / composant | Bouton ou action actuelle | Rôle visible | Route ou endpoint appelé | Décision recommandée | Justification |
|---|---|---|---|---|---|
| DashboardPage | — (aucune action CRUD, lecture seule) | Tous connectés | — (queries en GET) | Garder | Le dashboard est le point d'entrée lecture du flux automatique (KPIs, carte, priorités auto-calculées). Rien à changer. |
| Sidebar (AppShell) | Liens Dashboard → Config. risque (`/configurations-risque`) | Dashboard/Territoires/Événements/Météo/Risques/Alertes/Rapports : tous ; Imports/Matching : ANALYSTE_SIG+SUPER_ADMIN ; Administration/Config. risque : SUPER_ADMIN | Navigation uniquement | Garder | La navigation vers une future section « Intervention administrative » pourra y être ajoutée ; les restrictions actuelles par rôle sont correctes. |
| Header (CrisisHeader + AppShell) | « Déconnexion », « Mot de passe », « Tous les modules », « Voir la météo » | Tous | Navigation / `authApi.logout` | Garder | Actions de compte/navigation, sans rapport avec le CRUD manuel. |
| CrisisRoomPage / CrisisHeader:141 | « Créer un événement » / « Créer » (ouvre CreateEventModal) | ADMIN, SUPER_ADMIN (`canManageOps`) | `eventsApi.create` POST /events (+ `addTrack` + `createPolygonArea` si dessin) | Masquer du flux principal | La salle de crise est l'écran central de surveillance : la création manuelle y est contraire au mode automatique (événements auto-générés). Virtuellement doublonnée avec « Nouvel événement » d'Événements. À supprimer du header et à reloger dans la section « Intervention administrative » (création exceptionnelle, toujours ADMIN/SUPER_ADMIN ; endpoint existe ; aucun risque de casse du header si on retire juste le bouton). |
| CreateEventModal (CrisisRoom) | Formulaire de création + « Créer l'événement » | ADMIN, SUPER_ADMIN | `eventsApi.create` POST /events (+tracks/polygon) | Déplacer dans « Intervention administrative » | Contenu du modal : inutile dans le flux courant ; à conserver uniquement dans l'espace admin (endpoint existe). Ne conserver qu'UN seul point d'entrée de création pour éviter la duplication avec EvenementsPage. |
| EvenementsPage:139,346 | « Nouvel événement » → modal « Créer » | ADMIN, SUPER_ADMIN (`canManageOps`) | `eventsApi.create` POST /events (+ `addTrack` + `createPolygonArea`) | Déplacer dans « Intervention administrative » | La page Événements doit devenir un écran de surveillance/filtrage (événements auto-générés). La création manuelle = exception (correction/relance) pour ADMIN/SUPER_ADMIN uniquement. Endpoint réel. Risque faible : bouton à masquer de la toolbar, accès conservé via section admin. |
| EvenementDetailPage:354 | « Activer en crise » | Tous connectés | Aucun (store `useCrisisStore`) | Garder | Pose le contexte actif pour la carte — purement visuel, correspond à « Voir sur la carte » du parcours cible. Aucun endpoint, aucune donnée créée. |
| EvenementDetailPage:436 | Statuts du cycle de vie (BROUILLON → CLOTURE), boutons cliquables | ADMIN, SUPER_ADMIN (+ retour BROUILLON : SUPER_ADMIN) | `eventsApi.updateStatus` PATCH /events/{id}/status | Déplacer dans « Intervention administrative » | Le suivi/évaluation/clôture sont désormais automatiques. Forcer le statut devient une correction exceptionnelle (invalidation, relance) réservée ADMIN/SUPER_ADMIN. Endpoint existe. Risque : section à isoler dans un espace admin ; sinon la page conserve ses onglets lecture. |
| EvenementDetailPage:500 | « Ajouter le point » (point de trajectoire) | ADMIN, SUPER_ADMIN | `eventsApi.addTrack` POST /events/{id}/tracks | Déplacer dans « Intervention administrative » | Les trajectoires (OBSERVEE/PREVUE) doivent être alimentées par l'automatisation/détection. La saisie manuelle = exception. Endpoint réel. Risque faible (formulaire sous `canManageOps`). |
| EvenementDetailPage:541 | « Calculer » (bande tampon / zone d'influence) | ADMIN, SUPER_ADMIN | `eventsApi.calculateArea` POST /events/{id}/areas/calculate | Déplacer dans « Intervention administrative » | Le calcul des zones d'exposition fait partie de la chaîne automatique. Déclenchement manuel = relance contrôlée. Endpoint réel. |
| EvenementDetailPage:587 | « Définir la zone (N points) » (polygone dessiné) | ADMIN, SUPER_ADMIN | `eventsApi.createPolygonArea` POST /events/{id}/areas/polygon | Déplacer dans « Intervention administrative » | Dessin manuel d'une zone = exception (événement sans trajectoire). Endpoint réel. |
| EvenementDetailPage:623 | « Calculer exposition (toutes zones) » | ADMIN, SUPER_ADMIN | `eventsApi.calculateExposure` POST /events/{id}/exposure/calculate | Déplacer dans « Intervention administrative » | L'exposition est auto-calculée ; le bouton n'est qu'une relance manuelle de l'étape 3. Endpoint réel. |
| EvenementDetailPage:642 | « Recalculer les risques » (par phase) | ADMIN, SUPER_ADMIN | `eventsApi.recalculateRisks` POST /events/{id}/risks/recalculate | Déplacer dans « Intervention administrative » | Relance manuelle d'un calcul désormais automatique (et couvert aussi par le job de recalcul). À renommer en « Recalcul forcé » une fois relogé. Endpoint réel. |
| EvenementDetailPage:789 | « Supprimer » (zone d'influence) | ADMIN, SUPER_ADMIN | `eventsApi.deleteArea` DELETE /events/{id}/areas/{areaId} | Déplacer dans « Intervention administrative » | Invalidation d'une zone fautive = gestion d'exception. Endpoint réel. Risque : cette suppression recalcule l'exposition côté serveur (comportement conservé). |
| EvenementDetailPage:740,899 | « Retirer de l'exposition » / « Retirer » (commune exposée) | ADMIN, SUPER_ADMIN (colonne Actions) | `eventsApi.removeExposedCommune` DELETE /events/{id}/exposed-communes/{communeId} | Déplacer dans « Intervention administrative » | Corriger une commune à tort dans l'exposition = exception. Endpoint réel. |
| AlertesPage:137,289 | « Nouvelle alerte » → modal « Créer » | ADMIN, SUPER_ADMIN | `alertsApi.create` POST /alerts | Déplacer dans « Intervention administrative » | Alertes auto-générées/publiées par le système. Création manuelle = alerte exceptionnelle. Endpoint réel. Risque faible. |
| AlertesPage:202 | « Publier » (si statut BROUILLON) | ADMIN, SUPER_ADMIN | `alertsApi.publish` POST /alerts/{id}/publish | Déplacer dans « Intervention administrative » | La publication est automatique ; la publier à la main = relance contrôlée (ex. BROUILLON laissé en attente). Endpoint réel. |
| AlertesPage:210 | « Archiver » (si ≠ ARCHIVEE) | ADMIN, SUPER_ADMIN | `alertsApi.archive` POST /alerts/{id}/archive | Déplacer dans « Intervention administrative » | Archiver une alerte = gestion d'exception (retrait de diffusion). Endpoint réel. |
| RisquesPage:110 | « Recalculer » (global ou par événement + phase) | ADMIN, SUPER_ADMIN | `risksApi.recalculate` POST /risks/recalculate | Déplacer dans « Intervention administrative » | La page Risques doit être prioritairement de surveillance. Le recalcul manuel global est une relance contrôlée. Renommer éventuellement « Relancer le calcul des risques ». Endpoint réel. |
| WeatherMapPage / WeatherControls:186 | « Rafraîchir ce district » / « Rafraîchir tout le pays » | ADMIN, SUPER_ADMIN (`canRefresh`) | `weatherApi.refresh` POST /weather/refresh/communes (boucle districts) | Déplacer dans « Intervention administrative » | La synchro météo est automatique (crons). Le rafraîchissement à la main = relance contrôlée explicite de l'exception. Endpoint réel. Risque faible. |
| RightPanel (crise):365 | « Rafraîchir » (météo d'une commune) | ADMIN, SUPER_ADMIN (`canOps`) | `weatherApi.refresh` POST /weather/refresh/communes | Déplacer dans « Intervention administrative » | Idem synchro météo auto ; relance ponctuelle réservée aux admins. Endpoint réel. |
| RightPanel (crise):531 | « Recalculer » (risque d'une commune, par phase) | ADMIN, SUPER_ADMIN (`canOps`) | `risksApi.recalculate` POST /risks/recalculate | Déplacer dans « Intervention administrative » | Recalcul isolé = relance contrôlée. Endpoint réel. |
| RightPanel (crise):582 | « Exporter en CSV » (fiche commune) | **Tous connectés (non gated)** | `reportsApi.exportCsv` POST /reports/export/csv | Masquer du flux principal | Incohérence : l'endpoint `/reports/export/csv` est réservé ADMIN/SUPER_ADMIN (Phase 9) mais le bouton est visible pour CLIENT → 403 systématique. Le masquer hors section admin aligne l'UI sur le backend. Endpoint réel. Risque nul. |
| EventBilanTab:89 | « Rapport PDF » | ADMIN, SUPER_ADMIN (`canExport`) | `reportsApi.exportPdf` POST /reports/export/pdf | Garder | Le bilan est la dernière étape du parcours (« Consulter le bilan ») ; l'export PDF est un outil de lecture/diffusion déjà limité aux admins. Endpoint réel. |
| EventBilanTab:97 | « Communes exposées (CSV) » | ADMIN, SUPER_ADMIN | `reportsApi.exportCsv` POST /reports/export/csv | Garder | Export de lecture du bilan, déjà admin-only. Endpoint réel. |
| EventBilanTab:104 | « Zones (GeoJSON) » | ADMIN, SUPER_ADMIN | `reportsApi.exportGeoJson` POST /reports/export/geojson | Garder | Idem, déjà admin-only. Endpoint réel. |
| RapportsPage:75–81 | « Export CSV / GeoJSON / PDF » (card « Exporter ») | ADMIN, SUPER_ADMIN (`canExport`) | `reportsApi.exportCsv` / `exportGeoJson` / `exportPdf` POST /reports/export/* | Renommer (+ garder) | Ces exports génèrent à la demande des fichiers, mais avec l'automatisation, les rapports sont produits par le système. Renommer la card en « Exports manuels (intervention) » afin que l'utilisateur perçoive qu'il s'agit d'une exception, tout en la maintenant disponible (déjà admin-only). Endpoints réels. |
| RapportsPage:116 | « Télécharger » (rapport de l'historique) | Tous (mais liste `/reports` déjà restreinte ADMIN/SUPER_ADMIN) | `reportsApi.download` GET /reports/{id}/download | Garder | Téléchargement d'un rapport généré = lecture. Inoffensif, l'accès aux données est déjà limité côté backend. |
| ImportsPage:91 | « Envoyer » (upload GeoJSON/CSV/Shapefile) | ANALYSTE_SIG, SUPER_ADMIN (`canManageImports`, route requise) | `importsApi.upload` POST /imports | Garder | Import de données SIG = outil d'administration/données, hors flux utilisateur courant, déjà isolé derrière ses propres routes. |
| MatchingPage:109,112 | « Approuver » / « Rejeter » (appariements) | ANALYSTE_SIG, SUPER_ADMIN | `matchingApi.approve`/`reject` POST /matching/{id}/approve \| /reject | Garder | Validation humaine de l'appariement automatique = contrôle qualité, déjà restreint. Fait partie du pipeline d'import, pas du flux utilisateur. |
| AdminUsersPage:78,181 | « Nouvel utilisateur » + « Créer » | SUPER_ADMIN (route requise) | `usersApi.create` POST /users | Garder | Gestion des comptes = administration pure, hors automatisation. Endpoint réel. |
| AdminUsersPage:115 | « Désactiver » / « Activer » | SUPER_ADMIN | `usersApi.setStatus` PATCH /users/{id}/status | Garder | Idem, administration. |
| RiskConfigPage:86,165 | « Nouvelle configuration » + « Créer » | SUPER_ADMIN (route requise) | `risksApi.createConfiguration` POST /risk-configurations | Garder | Paramétrage du moteur qui pilote l'automatisation — doit rester en administration, sans changement. |
| PasswordPage:71 | « Enregistrer » (changement mot de passe) | Tous connectés | `authApi.changePassword` PATCH /users/me/password | Garder | Compte utilisateur, sans lien avec le CRUD manuel. |
| Territoires/CommuneDetail/DistrictDetail | — (aucune action CRUD) | — | GET uniquement | Garder | Pages de consultation ; conviennent au flux « Consulter/Filtrer ». |
| EventChronologieTab | — (lecture seule) | Tous | GET /events/{id}/history | Garder | La chronologie est le cœur de « Comprendre » en mode automatique (historique détaillé). |
| CrisisHeader:153 « Actualiser maintenant » (CrisisRoom) | Rafraîchissement des queries actives (`refetchQueries`) | Tous connectés | Aucun endpoint (client-side refetch) | Renommer | Ne crée/modifie rien : relit les données auto-synchronisées. Utile pour la surveillance. Renommer en « Actualiser les données » pour refléter la lecture et éviter toute confusion avec une action d'écriture. |
| LeftPanel (crise):323 | Sélection d'événement « Actif » | Tous | Aucun (store) | Garder | Choisir le contexte affiché = filtre, conforme à « Faire/voir sur la carte ». |

---

## 3. Récapitulatif des décisions

- **Garder** (11) : Dashboard, navigation, « Activer en crise », exports Bilan (PDF/CSV/GeoJSON), « Télécharger », Imports, Matching, Administration (users), Config. risque, Mot de passe, Territoires, Chronologie, LeftPanel, « Actualiser maintenant » (avec renommage possible).
- **Masquer du flux principal** (2) : « Créer un événement » du header de crise (relogée en admin), « Exporter en CSV » du RightPanel (à gater + reloger).
- **Renommer** (2) : card « Exporter » de Rapports (→ « Exports manuels (intervention) »), « Actualiser maintenant » (→ « Actualiser les données »).
- **Déplacer dans « Intervention administrative »** (14) : création événement, cycle de vie statuts, trajectoire, bande tampon, zone polygonale, exposition, recalcul risques (detail + globale + commune), retraits/suppressions (zone, commune), création alerte, publication, archivage, rafraîchissement météo (pays + commune).
- **Supprimer** : aucun — aucun code réellement inutilisé n'a été identifié. Du code API reste sans bouton UI (`eventsApi.update/remove`, `alertsApi.update`, `matchingApi.run/manualLink`, `aiApi.remove`) mais doit être conservé (utilisé par l'automatisation backend et les flux non encore couverts).

---

## 4. Points d'attention détectés au passage

1. **Incohérence UI/backend** : `RightPanel:582` expose « Exporter en CSV » à tous, mais POST /reports/export/csv est ADMIN/SUPER_ADMIN → un CLIENT reçoit un 403. À gater.
2. **Double point d'entrée de création d'événement** : header de crise (CrisisHeader) *et* toolbar Événements → à unifier en un seul accès admin.
3. **Exports et recalculs manuels encore dans le flux** : à reloger sans supprimer (endpoints réels, à conserver pour les exceptions).

---

## 5. Vision UI cible (proposée, pour validation ultérieure)

```
Surveiller (Dashboard / salle de crise / Événements, Alertes)
  → Filtrer (listes, panneaux, recherche)
  → Consulter (fiches commune, détail événement lecture)
  → Comprendre (chronologie, facteurs de risque, explications)
  → Voir sur la carte (salle de crise, couches auto)
  → Consulter le bilan (onglet Bilan + exports lecture)
       └── « Intervention administrative » (réservé ADMIN/SUPER_ADMIN)
            = force/recalc/correction/invalidation/création exceptionnelle
```

---

*Rapport généré en lecture seule. Aucune modification du frontend, du backend ou de la base de données n'a été effectuée.*