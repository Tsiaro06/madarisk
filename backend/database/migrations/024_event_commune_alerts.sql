-- Migration 024 : niveaux d'alerte cyclonique historiques par commune.
--
-- Objectif : visualiser, commune par commune et à chaque instant d'une
-- chronologie, le niveau d'alerte officiel malgache (VERT, JAUNE, ROUGE, BLEU)
-- d'un événement passé (ex. cyclone Batsirai 2022) — « GRIS » (hors alerte)
-- n'est jamais stocké : c'est l'absence de ligne active à l'instant consulté.
--
-- La traçabilité est portée par chaque ligne : période de validité, nature de
-- l'information (officielle / prévision / impact observé / estimation), source
-- et commentaire. La portée du territoire (`territory_scope`) indique si le
-- niveau a été publié à l'échelle communale ou hérité d'un district / d'une
-- région — dans ce dernier cas la donnée est une estimation spatiale et doit
-- être signalée comme telle dans l'interface.
--
-- Additif et réversible : aucune table existante n'est modifiée.

CREATE TABLE IF NOT EXISTS event_commune_alert_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES hazard_events(id) ON DELETE CASCADE,
  commune_id UUID NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
  -- Niveau d'alerte cyclonique publié : quatre niveaux, jamais « GRIS ».
  alert_level VARCHAR(10) NOT NULL,
  -- Période de validité du niveau. `valid_to` NULL = niveau encore en vigueur.
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ,
  -- Nature de l'information (distinction officielle / prévision / observé / estimé).
  info_type VARCHAR(20) NOT NULL,
  -- Échelle à laquelle le niveau a été publié (COMMUNE) ou hérité.
  territory_scope VARCHAR(20) NOT NULL DEFAULT 'COMMUNE',
  source_name VARCHAR(255),
  source_url TEXT,
  comment TEXT,
  -- Niveau de confiance éventuel (0 à 1), quand le modèle le prévoit.
  confidence NUMERIC(3,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_commune_alert_history_level_check
    CHECK (alert_level IN ('VERT', 'JAUNE', 'ROUGE', 'BLEU')),
  CONSTRAINT event_commune_alert_history_info_check
    CHECK (info_type IN ('OFFICIELLE', 'PREVISION', 'IMPACT_OBSERVE', 'ESTIMATION')),
  CONSTRAINT event_commune_alert_history_scope_check
    CHECK (territory_scope IN ('COMMUNE', 'DISTRICT', 'REGION', 'EVENEMENT')),
  CONSTRAINT event_commune_alert_history_confidence_check
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  CONSTRAINT event_commune_alert_history_validity_check
    CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

-- Recherche par événement, par commune, et surtout par (événement, commune) à
-- un instant donné : c'est la requête de la carte, exécutée à chaque
-- changement d'heure sur la chronologie.
CREATE INDEX IF NOT EXISTS idx_event_commune_alert_history_event
  ON event_commune_alert_history (event_id);
CREATE INDEX IF NOT EXISTS idx_event_commune_alert_history_commune
  ON event_commune_alert_history (commune_id);
CREATE INDEX IF NOT EXISTS idx_event_commune_alert_history_event_commune
  ON event_commune_alert_history (event_id, commune_id);
CREATE INDEX IF NOT EXISTS idx_event_commune_alert_history_event_valid
  ON event_commune_alert_history (event_id, valid_from, valid_to);
