-- Migration 007: weather_sources, weather_observations, risk_*

CREATE TABLE IF NOT EXISTS weather_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  provider_type VARCHAR(50) NOT NULL,
  base_url TEXT,
  refresh_interval_minutes INTEGER NOT NULL DEFAULT 60,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT weather_sources_name_unique UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS weather_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weather_source_id UUID NOT NULL REFERENCES weather_sources(id) ON DELETE CASCADE,
  commune_id UUID REFERENCES communes(id) ON DELETE CASCADE,
  event_id UUID REFERENCES hazard_events(id) ON DELETE SET NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  latitude NUMERIC(10,6) NOT NULL,
  longitude NUMERIC(10,6) NOT NULL,
  precipitation_mm NUMERIC(10,2),
  rainfall_24h_mm NUMERIC(10,2),
  temperature_c NUMERIC(6,2),
  humidity_percent NUMERIC(6,2),
  wind_speed_kmh NUMERIC(8,2),
  wind_direction_deg NUMERIC(6,2),
  pressure_hpa NUMERIC(8,2),
  weather_code VARCHAR(50),
  raw_data JSONB,
  geom GEOMETRY(Point, 4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS risk_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  rain_weight NUMERIC(6,4) NOT NULL,
  wind_weight NUMERIC(6,4) NOT NULL,
  proximity_weight NUMERIC(6,4) NOT NULL,
  vulnerability_weight NUMERIC(6,4) NOT NULL,
  exposure_weight NUMERIC(6,4) NOT NULL,
  low_threshold NUMERIC(8,2) NOT NULL,
  moderate_threshold NUMERIC(8,2) NOT NULL,
  high_threshold NUMERIC(8,2) NOT NULL,
  extreme_threshold NUMERIC(8,2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS risk_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commune_id UUID NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
  event_id UUID REFERENCES hazard_events(id) ON DELETE SET NULL,
  risk_configuration_id UUID REFERENCES risk_configurations(id) ON DELETE SET NULL,
  phase risk_phase NOT NULL,
  risk_score NUMERIC(8,2) NOT NULL,
  risk_level risk_level NOT NULL,
  rain_score NUMERIC(8,2) NOT NULL DEFAULT 0,
  wind_score NUMERIC(8,2) NOT NULL DEFAULT 0,
  proximity_score NUMERIC(8,2) NOT NULL DEFAULT 0,
  vulnerability_score NUMERIC(8,2) NOT NULL DEFAULT 0,
  exposure_score NUMERIC(8,2) NOT NULL DEFAULT 0,
  explanation JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_version VARCHAR(50) NOT NULL DEFAULT 'v1',
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weather_observations_commune_id ON weather_observations(commune_id);
CREATE INDEX IF NOT EXISTS idx_weather_observations_observed_at ON weather_observations(observed_at);
CREATE INDEX IF NOT EXISTS idx_weather_observations_event_id ON weather_observations(event_id);
CREATE INDEX IF NOT EXISTS idx_weather_observations_geom_gist ON weather_observations USING gist(geom);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_commune_id ON risk_assessments(commune_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_event_id ON risk_assessments(event_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_assessed_at ON risk_assessments(assessed_at);
