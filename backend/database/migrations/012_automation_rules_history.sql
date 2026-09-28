-- Migration 012 : Automatisation – règles de détection, historique des traitements
-- Additive uniquement : aucune suppression, aucune donnée modifiée.
-- Extends event_type enum with VAGUE_DE_CHALEUR (IF NOT EXISTS, safe on PG ≥14).

-- ── Extend event_type enum ────────────────────────────────────────────────
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'VAGUE_DE_CHALEUR';

-- ── New enum types ────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE detection_operator AS ENUM ('GT','GE','LT','LE','EQ','BETWEEN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE automation_run_status AS ENUM ('RUNNING','SUCCESS','FAILED','PARTIAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── hazard_detection_rules ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hazard_detection_rules (
  id                            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  hazard_type                   event_type        NOT NULL,
  metric                        VARCHAR(60)       NOT NULL,
  operator                      detection_operator NOT NULL,
  threshold                     NUMERIC(10,2)     NOT NULL,
  threshold_max                 NUMERIC(10,2),
  duration_minutes              INTEGER           NOT NULL DEFAULT 0,
  aggregation_window_minutes    INTEGER           NOT NULL DEFAULT 0,
  forecast_horizon_hours        INTEGER           NOT NULL DEFAULT 0,
  severity_rules                JSONB             NOT NULL DEFAULT '[]',
  is_active                     BOOLEAN           NOT NULL DEFAULT true,
  region_id                     UUID              REFERENCES regions(id)   ON DELETE SET NULL,
  district_id                   UUID              REFERENCES districts(id) ON DELETE SET NULL,
  commune_id                    UUID              REFERENCES communes(id)  ON DELETE SET NULL,
  created_by                    UUID              REFERENCES users(id)     ON DELETE SET NULL,
  created_at                    TIMESTAMPTZ       NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ       NOT NULL DEFAULT now(),

  -- severity_rules doit être un tableau JSON
  CHECK (jsonb_typeof(severity_rules) = 'array'),

  -- Quand l'opérateur est BETWEEN, threshold_max est obligatoire et cohérent
  CHECK (
    operator != 'BETWEEN'
    OR (threshold_max IS NOT NULL AND threshold_max >= threshold)
  ),

  -- Au plus une seule portée géographique peut être définie
  CHECK (
    ((region_id   IS NOT NULL)::INT
   + (district_id IS NOT NULL)::INT
   + (commune_id  IS NOT NULL)::INT) <= 1
  )
);

CREATE INDEX IF NOT EXISTS idx_hazard_detection_rules_active
  ON hazard_detection_rules (is_active) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_hazard_detection_rules_hazard_type
  ON hazard_detection_rules (hazard_type, is_active);

CREATE INDEX IF NOT EXISTS idx_hazard_detection_rules_portee
  ON hazard_detection_rules (region_id, district_id, commune_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON hazard_detection_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── weather_sync_runs ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weather_sync_runs (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at           TIMESTAMPTZ          NOT NULL DEFAULT now(),
  finished_at          TIMESTAMPTZ,
  status               automation_run_status NOT NULL DEFAULT 'RUNNING',
  scope                VARCHAR(50)          NOT NULL,  -- OBSERVATIONS | FORECASTS | DGM_MAPROOM
  source               VARCHAR(100)         NOT NULL,  -- OPEN_METEO | DGM_MAPROOM
  records_processed    INTEGER              NOT NULL DEFAULT 0,
  communes_processed   INTEGER              NOT NULL DEFAULT 0,
  errors_count         INTEGER              NOT NULL DEFAULT 0,
  error_message        TEXT,
  details              JSONB                NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ          NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weather_sync_runs_source_time
  ON weather_sync_runs (source, started_at DESC);

-- ── hazard_detection_runs ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hazard_detection_runs (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at           TIMESTAMPTZ          NOT NULL DEFAULT now(),
  finished_at          TIMESTAMPTZ,
  status               automation_run_status NOT NULL DEFAULT 'RUNNING',
  trigger              VARCHAR(20)          NOT NULL DEFAULT 'SCHEDULED',  -- SCHEDULED | MANUAL
  rules_evaluated      INTEGER              NOT NULL DEFAULT 0,
  detections           INTEGER              NOT NULL DEFAULT 0,
  rules_triggered      INTEGER              NOT NULL DEFAULT 0,
  events_created       INTEGER              NOT NULL DEFAULT 0,
  events_updated       INTEGER              NOT NULL DEFAULT 0,
  alerts_created       INTEGER              NOT NULL DEFAULT 0,
  error_message        TEXT,
  details              JSONB                NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ          NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hazard_detection_runs_time
  ON hazard_detection_runs (started_at DESC);

-- ── event_update_runs ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_update_runs (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at           TIMESTAMPTZ          NOT NULL DEFAULT now(),
  finished_at          TIMESTAMPTZ,
  status               automation_run_status NOT NULL DEFAULT 'RUNNING',
  trigger              VARCHAR(20)          NOT NULL DEFAULT 'SCHEDULED', -- SCHEDULED | MANUAL
  source               VARCHAR(100)         NOT NULL DEFAULT 'UNKNOWN',
  updates_applied      INTEGER              NOT NULL DEFAULT 0,
  events_created       INTEGER              NOT NULL DEFAULT 0,
  events_updated       INTEGER              NOT NULL DEFAULT 0,
  alerts_updated       INTEGER              NOT NULL DEFAULT 0,
  error_message        TEXT,
  details              JSONB                NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ          NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_update_runs_time
  ON event_update_runs (started_at DESC);

-- ── event_status_history ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_status_history (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id       UUID         NOT NULL REFERENCES hazard_events(id) ON DELETE CASCADE,
  from_status    event_status,
  to_status      event_status NOT NULL,
  reason         TEXT,
  actor_type     VARCHAR(20)  NOT NULL DEFAULT 'SYSTEM', -- SYSTEM | USER
  actor_id       UUID         REFERENCES users(id) ON DELETE SET NULL,
  source         VARCHAR(100) NOT NULL DEFAULT 'UNKNOWN',
  recorded_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_status_history_event_time
  ON event_status_history (event_id, recorded_at DESC);

-- ── event_snapshots ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_snapshots (
  id                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id                 UUID              NOT NULL REFERENCES hazard_events(id) ON DELETE CASCADE,
  recorded_at              TIMESTAMPTZ       NOT NULL DEFAULT now(),
  trigger                  VARCHAR(50)       NOT NULL DEFAULT 'UNKNOWN',  -- SCHEDULED | MANUAL_DETECTION | MANUAL_UI
  status                   event_status      NOT NULL,
  severity                 severity_level,
  exposed_commune_count    INTEGER           NOT NULL DEFAULT 0,
  risk_level_summary       JSONB             NOT NULL DEFAULT '{}',
  metric_values            JSONB             NOT NULL DEFAULT '{}',
  geometry                 GEOMETRY(MultiPolygon, 4326),
  details                  JSONB             NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_event_snapshots_event_time
  ON event_snapshots (event_id, recorded_at DESC);

-- ── provider_errors ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_errors (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider      VARCHAR(100) NOT NULL,
  operation     VARCHAR(100) NOT NULL,
  status_code   INTEGER,
  message       TEXT,
  occurred_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  details       JSONB        NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_provider_errors_provider_time
  ON provider_errors (provider, occurred_at DESC);
