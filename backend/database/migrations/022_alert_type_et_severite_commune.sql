-- Types d'alerte.weather : les événements VAGUE_DE_CHALEUR, GLISSEMENT_TERRAIN
-- et FEU_VEGETATION étaient repliés sur 'INFORMATION' par la table de
-- correspondance, ce qui exposait des titres bruts ("Prévision
-- VAGUE_DE_CHALEUR — Ampanihy") et masquait la nature réelle de l'alerte.
ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'VAGUE_DE_CHALEUR';
ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'GLISSEMENT_TERRAIN';
ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'FEU_VEGETATION';

-- Sévérité propre à chaque commune détectée. Elle permet de n'alerter que les
-- communes dont le dépassement de seuil est réellement significatif : une
-- commune à 57,8 mm pour un seuil à 50 mm est FAIBLE, même si une autre
-- commune du même événement atteint 61,7 mm (MODEREE).
ALTER TABLE event_detection_communes
  ADD COLUMN IF NOT EXISTS severity severity_level;

COMMENT ON COLUMN event_detection_communes.severity IS
  'Sévérité de la détection pour cette commune (échelle severity_level) ; NULL pour les lignes antérieures à cette migration.';
