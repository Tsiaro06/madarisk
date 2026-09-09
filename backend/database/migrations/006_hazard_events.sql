-- Migration 006: hazard_events + tracks (points) + areas + exposition

CREATE TABLE IF NOT EXISTS hazard_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  type event_type NOT NULL,
  status event_status NOT NULL DEFAULT 'BROUILLON',
  severity severity_level NOT NULL DEFAULT 'FAIBLE',
  description TEXT,
  source_name VARCHAR(150),
  source_url TEXT,
  started_at TIMESTAMPTZ,
  expected_end_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hazard_events_event_code_unique UNIQUE (event_code)
);

CREATE TABLE IF NOT EXISTS event_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES hazard_events(id) ON DELETE CASCADE,
  observed_at TIMESTAMPTZ NOT NULL,
  forecast_for TIMESTAMPTZ,
  track_type track_type NOT NULL DEFAULT 'OBSERVEE',
  latitude NUMERIC(10,6) NOT NULL,
  longitude NUMERIC(10,6) NOT NULL,
  wind_speed_kmh NUMERIC(8,2),
  gust_speed_kmh NUMERIC(8,2),
  pressure_hpa NUMERIC(8,2),
  precipitation_mm NUMERIC(8,2),
  movement_direction VARCHAR(50),
  movement_speed_kmh NUMERIC(8,2),
  geom GEOMETRY(Point, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES hazard_events(id) ON DELETE CASCADE,
  phase risk_phase NOT NULL,
  risk_level risk_level NOT NULL,
  radius_km NUMERIC(10,2),
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  source VARCHAR(100),
  geom GEOMETRY(MultiPolygon, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exposed_communes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES hazard_events(id) ON DELETE CASCADE,
  commune_id UUID NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
  distance_to_track_km NUMERIC(10,2),
  is_inside_influence_area BOOLEAN NOT NULL DEFAULT true,
  exposed_population INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT exposed_communes_event_commune_unique UNIQUE (event_id, commune_id)
);

CREATE INDEX IF NOT EXISTS idx_hazard_events_status ON hazard_events(status);
CREATE INDEX IF NOT EXISTS idx_hazard_events_type ON hazard_events(type);
CREATE INDEX IF NOT EXISTS idx_hazard_events_event_code ON hazard_events(event_code);
CREATE INDEX IF NOT EXISTS idx_event_tracks_event_id ON event_tracks(event_id);
CREATE INDEX IF NOT EXISTS idx_event_tracks_observed_at ON event_tracks(observed_at);
CREATE INDEX IF NOT EXISTS idx_event_tracks_geom_gist ON event_tracks USING gist(geom);
CREATE INDEX IF NOT EXISTS idx_event_areas_event_id ON event_areas(event_id);
CREATE INDEX IF NOT EXISTS idx_event_areas_geom_gist ON event_areas USING gist(geom);
CREATE INDEX IF NOT EXISTS idx_exposed_communes_event ON exposed_communes(event_id);
CREATE INDEX IF NOT EXISTS idx_exposed_communes_commune ON exposed_communes(commune_id);
