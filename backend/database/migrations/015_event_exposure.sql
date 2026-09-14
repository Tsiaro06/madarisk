-- Migration 015: calcul automatique de l'exposition et des risques
-- Additif : zones d'influence (event_areas), communes exposées (exposed_communes),
-- communes au-dessus du seuil (event_detection_communes) et historique des calculs
-- (event_exposure_runs).

ALTER TABLE event_areas
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS is_estimate BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE exposed_communes
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(30),
  ADD COLUMN IF NOT EXISTS data_type VARCHAR(30),
  ADD COLUMN IF NOT EXISTS overlap_percent NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Communes réellement au-dessus du seuil lors d'une détection (donnée factuelle).
-- Conservées en historique (upsert sur (event_id, commune_id)).
CREATE TABLE IF NOT EXISTS event_detection_communes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES hazard_events(id) ON DELETE CASCADE,
  commune_id UUID NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
  metric VARCHAR(50),
  value NUMERIC(12,2),
  threshold NUMERIC(12,2),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_detection_communes_event_commune_unique UNIQUE (event_id, commune_id)
);

-- Historique des calculs d'exposition automatiques (audit + idempotence).
CREATE TABLE IF NOT EXISTS event_exposure_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES hazard_events(id) ON DELETE CASCADE,
  trigger VARCHAR(20) NOT NULL,
  areas_created INTEGER NOT NULL DEFAULT 0,
  communes_upserted INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_detection_communes_event ON event_detection_communes(event_id);
CREATE INDEX IF NOT EXISTS idx_event_exposure_runs_event ON event_exposure_runs(event_id);