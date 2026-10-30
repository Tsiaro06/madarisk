-- Migration 027: suppression manuelle durable d'une alerte automatique
--
-- Un archivage déclenché par un ADMIN doit résister au cycle de génération
-- suivant. Sans ce marqueur, `findAutomaticForTarget` ne retrouve plus
-- l'alerte (statut ARCHIVEE) et en recrée une nouvelle pour la même cible.
--
-- Le marqueur est posé uniquement par l'archivage manuel, remis à NULL par
-- toute republication ou mise à jour automatique. Il ne concerne jamais les
-- alertes historiques importées (is_historique).

ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS archived_manually_at TIMESTAMPTZ;

COMMENT ON COLUMN alerts.archived_manually_at IS
  'Date d''archivage manuel : empêche la régénération automatique de la même cible.';
