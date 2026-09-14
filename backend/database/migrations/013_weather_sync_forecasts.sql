-- Migration 013 : Synchronisation météo automatique — prévisions persistées, rafales, data_kind
-- Additive uniquement : aucune suppression, aucune donnée modifiée.

-- ── weather_observations : rafales de vent + nature de la donnée (OBSERVE) ──
ALTER TABLE weather_observations ADD COLUMN IF NOT EXISTS wind_gusts_kmh NUMERIC(10,2);
ALTER TABLE weather_observations ADD COLUMN IF NOT EXISTS data_kind VARCHAR(20) NOT NULL DEFAULT 'OBSERVE';

ALTER TABLE weather_observations DROP CONSTRAINT IF EXISTS weather_observations_data_kind_check;
ALTER TABLE weather_observations
  ADD CONSTRAINT weather_observations_data_kind_check
  CHECK (data_kind IN ('OBSERVE', 'PREVU', 'ESTIME'));

-- ── weather_forecasts : prévisions quotidiennes par commune (PREVU) ─────────
CREATE TABLE IF NOT EXISTS weather_forecasts (
  id                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  weather_source_id        UUID NOT NULL REFERENCES weather_sources(id) ON DELETE CASCADE,
  commune_id               UUID REFERENCES communes(id) ON DELETE CASCADE,
  forecast_day             DATE NOT NULL,
  generated_at             TIMESTAMPTZ NOT NULL,
  latitude                 NUMERIC(10,6) NOT NULL,
  longitude                NUMERIC(10,6) NOT NULL,
  temperature_min_c        NUMERIC(6,2),
  temperature_max_c        NUMERIC(6,2),
  relative_humidity_avg    NUMERIC(6,2),
  precipitation_sum_mm     NUMERIC(10,2),
  wind_speed_max_kmh       NUMERIC(10,2),
  wind_gusts_max_kmh       NUMERIC(10,2),
  wind_direction_deg       NUMERIC(6,2),
  pressure_avg_hpa         NUMERIC(8,2),
  weather_code             VARCHAR(50),
  raw_data                 JSONB,
  data_kind                VARCHAR(20) NOT NULL DEFAULT 'PREVU',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT weather_forecasts_data_kind_check
    CHECK (data_kind IN ('OBSERVE', 'PREVU', 'ESTIME'))
);

-- Dédoublonnage structurel : une source, une commune, un jour → une seule ligne
CREATE UNIQUE INDEX IF NOT EXISTS uq_weather_forecasts_commune_day
  ON weather_forecasts (commune_id, weather_source_id, forecast_day)
  WHERE commune_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_weather_forecasts_commune_day
  ON weather_forecasts (commune_id, forecast_day DESC);

CREATE INDEX IF NOT EXISTS idx_weather_forecasts_source_generated
  ON weather_forecasts (weather_source_id, generated_at DESC);

-- ── weather_observations : déduplication par (commune, source, observed_at) ──
-- L'index n'est créé que si aucune donnée existante ne le contredit (non destructif).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_weather_observations_dedupe')
     AND NOT EXISTS (
       SELECT 1
       FROM (
         SELECT commune_id, weather_source_id, observed_at
         FROM weather_observations
         WHERE commune_id IS NOT NULL
         GROUP BY commune_id, weather_source_id, observed_at
         HAVING COUNT(*) > 1
       ) duplicates
       LIMIT 1
     ) THEN
    EXECUTE '
      CREATE UNIQUE INDEX uq_weather_observations_dedupe
        ON weather_observations (commune_id, weather_source_id, observed_at)
        WHERE commune_id IS NOT NULL';
  END IF;
END $$;