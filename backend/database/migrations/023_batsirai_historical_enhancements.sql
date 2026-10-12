-- Migration 023 : améliorations pour visualisation historique Batsirai
-- Ajoute rayons de vent documentés (nullable, jamais inventés) et impacts communaux temporels

-- 1. Colonnes rayons de vent sur event_tracks
ALTER TABLE event_tracks
  ADD COLUMN IF NOT EXISTS radius_34kt_km NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS radius_50kt_km NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS radius_64kt_km NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS radius_max_km NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS radius_source VARCHAR(255),
  ADD COLUMN IF NOT EXISTS radius_measure_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS radius_quality VARCHAR(50),
  ADD COLUMN IF NOT EXISTS data_quality VARCHAR(50),
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(3,2);

-- 2. Table des impacts communaux temporels (observés)
CREATE TABLE IF NOT EXISTS event_commune_impacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES hazard_events(id) ON DELETE CASCADE,
  commune_id UUID NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
  first_affected_at TIMESTAMPTZ,
  last_affected_at TIMESTAMPTZ,
  impact_state VARCHAR(50) NOT NULL DEFAULT 'UNKNOWN',
  observed_risk_level VARCHAR(50) NOT NULL DEFAULT 'INCONNU',
  forecast_risk_level VARCHAR(50),
  source_name VARCHAR(255),
  source_url TEXT,
  confidence NUMERIC(3,2),
  method VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_commune_impacts_unique UNIQUE (event_id, commune_id)
);

CREATE INDEX IF NOT EXISTS idx_event_commune_impacts_event_id ON event_commune_impacts(event_id);
CREATE INDEX IF NOT EXISTS idx_event_commune_impacts_commune_id ON event_commune_impacts(commune_id);
CREATE INDEX IF NOT EXISTS idx_event_commune_impacts_first ON event_commune_impacts(first_affected_at);
CREATE INDEX IF NOT EXISTS idx_event_commune_impacts_last ON event_commune_impacts(last_affected_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_commune_impacts_impact_state_check'
  ) THEN
    ALTER TABLE event_commune_impacts
      ADD CONSTRAINT event_commune_impacts_impact_state_check
      CHECK (impact_state IN ('NOT_REACHED','CENTER_CROSSED','WIND_IMPACT','RAIN_IMPACT','FLOOD_IMPACT','IMPACT_ESTIMATED','UNKNOWN'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_commune_impacts_obs_risk_check'
  ) THEN
    ALTER TABLE event_commune_impacts
      ADD CONSTRAINT event_commune_impacts_obs_risk_check
      CHECK (observed_risk_level IN ('FAIBLE','MODERE','ELEVE','TRES_ELEVE','INCONNU'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_commune_impacts_fc_risk_check'
  ) THEN
    ALTER TABLE event_commune_impacts
      ADD CONSTRAINT event_commune_impacts_fc_risk_check
      CHECK (forecast_risk_level IS NULL OR forecast_risk_level IN ('FAIBLE','MODERE','ELEVE','TRES_ELEVE','INCONNU'));
  END IF;
END $$;
