-- Migration 007: Weather & Risks
-- Crée weather_sources, weather_observations, risk_configurations, risk_assessments.

CREATE TABLE IF NOT EXISTS weather_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  url VARCHAR(500),
  api_type VARCHAR(50),
  is_active BOOLEAN NOT NULL DEFAULT true,
  config JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS weather_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES weather_sources(id) ON DELETE CASCADE,
  commune_id UUID NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
  geom GEOMETRY(Point, 4326),
  temperature NUMERIC(5,2),
  humidity NUMERIC(5,2),
  wind_speed NUMERIC(6,2),
  wind_direction NUMERIC(5,2),
  precipitation NUMERIC(8,2),
  pressure NUMERIC(7,1),
  observed_at TIMESTAMPTZ NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS risk_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  event_type event_type NOT NULL,
  risk_phase risk_phase NOT NULL DEFAULT 'PREVENTION',
  parameters JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS risk_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commune_id UUID NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
  event_id UUID REFERENCES hazard_events(id) ON DELETE SET NULL,
  configuration_id UUID REFERENCES risk_configurations(id) ON DELETE SET NULL,
  risk_level risk_level NOT NULL DEFAULT 'LOW',
  risk_score NUMERIC(5,2),
  factors JSONB,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weather_observations_commune_id ON weather_observations(commune_id);
CREATE INDEX IF NOT EXISTS idx_weather_observations_observed_at ON weather_observations(observed_at);
CREATE INDEX IF NOT EXISTS idx_weather_observations_geom_gist ON weather_observations USING gist(geom);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_commune_id ON risk_assessments(commune_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_event_id ON risk_assessments(event_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_assessed_at ON risk_assessments(assessed_at);
