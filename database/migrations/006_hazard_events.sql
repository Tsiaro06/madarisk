-- Migration 006: Hazard Events
-- Crée hazard_events, event_tracks, event_areas, exposed_communes.

CREATE TABLE IF NOT EXISTS hazard_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type event_type NOT NULL,
  status event_status NOT NULL DEFAULT 'WATCH',
  severity severity_level,
  description TEXT,
  source VARCHAR(255),
  external_id VARCHAR(255),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  bbox GEOMETRY(Envelope, 4326),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES hazard_events(id) ON DELETE CASCADE,
  track_type track_type NOT NULL DEFAULT 'FORECAST',
  geom GEOMETRY(LineString, 4326) NOT NULL,
  max_wind_speed NUMERIC(6,2),
  min_pressure NUMERIC(6,1),
  observed_at TIMESTAMPTZ NOT NULL,
  forecast_hours INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES hazard_events(id) ON DELETE CASCADE,
  geom GEOMETRY(Polygon, 4326) NOT NULL,
  radius_km NUMERIC(8,2),
  area_label VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exposed_communes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES hazard_events(id) ON DELETE CASCADE,
  commune_id UUID NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
  exposure_level severity_level,
  distance_km NUMERIC(8,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT exposed_communes_event_commune_unique UNIQUE (event_id, commune_id)
);

CREATE INDEX IF NOT EXISTS idx_hazard_events_status ON hazard_events(status);
CREATE INDEX IF NOT EXISTS idx_hazard_events_type ON hazard_events(type);
CREATE INDEX IF NOT EXISTS idx_event_tracks_event_id ON event_tracks(event_id);
CREATE INDEX IF NOT EXISTS idx_event_tracks_observed_at ON event_tracks(observed_at);
CREATE INDEX IF NOT EXISTS idx_event_tracks_geom_gist ON event_tracks USING gist(geom);
CREATE INDEX IF NOT EXISTS idx_event_areas_event_id ON event_areas(event_id);
CREATE INDEX IF NOT EXISTS idx_event_areas_geom_gist ON event_areas USING gist(geom);
CREATE INDEX IF NOT EXISTS idx_exposed_communes_event ON exposed_communes(event_id);
CREATE INDEX IF NOT EXISTS idx_exposed_communes_commune ON exposed_communes(commune_id);
