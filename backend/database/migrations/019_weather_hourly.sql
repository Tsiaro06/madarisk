-- Migration 019 : weather_hourly (courbe horaire observee ET prevue)
-- Additive uniquement : aucune suppression, aucune donnee modifiee.
--
-- Pourquoi une table dediee plutot que weather_observations :
--   weather_observations porte l'instantane « current » utilise par la carte
--   de risque, les scores et le monitoring. Y ajouter 48 lignes par commune
--   et par run deplacerait en permanence `latestObservationAt`, ferait
--   vibrer la freshness et le calcul de risque pour rien. Les deux besoins
--   sont differents : ici on veut l'historique et la prevision a l'heure.

CREATE TABLE IF NOT EXISTS weather_hourly (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weather_source_id  UUID NOT NULL REFERENCES weather_sources(id) ON DELETE CASCADE,
  commune_id         UUID NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
  -- Heure couverte par la ligne, en UTC. Pour une heure deja passee le
  -- fournisseur renvoie une valeur d'analyse/reanalyse, pour une heure a venir
  -- une valeur de prevision : `is_forecast` distingue les deux.
  hour_at            TIMESTAMPTZ NOT NULL,
  latitude           NUMERIC(10,6) NOT NULL,
  longitude          NUMERIC(10,6) NOT NULL,
  temperature_c      NUMERIC(6,2),
  humidity_percent   NUMERIC(6,2),
  precipitation_mm   NUMERIC(10,2),
  rain_mm            NUMERIC(10,2),
  wind_speed_kmh     NUMERIC(8,2),
  wind_gusts_kmh     NUMERIC(8,2),
  wind_direction_deg NUMERIC(6,2),
  pressure_hpa       NUMERIC(8,2),
  weather_code       VARCHAR(50),
  is_forecast        BOOLEAN NOT NULL DEFAULT FALSE,
  raw_data           JSONB,
  geom               GEOMETRY(Point, 4326),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Une source, une commune, une heure : une seule ligne. Le DO UPDATE qui suit
-- est indispensable (contrairement a weather_forecasts) : une heure de
-- PREVISION doit etre rafraichie a chaque run, sinon la courbe resterait figee
-- sur le premier modele downloaded et l'ecart au reel grossirait.
CREATE UNIQUE INDEX IF NOT EXISTS uq_weather_hourly_commune_hour
  ON weather_hourly (commune_id, weather_source_id, hour_at);

-- Courbe d'une commune : lecture par (commune, heure decroissante).
CREATE INDEX IF NOT EXISTS idx_weather_hourly_commune
  ON weather_hourly (commune_id, hour_at DESC);

-- Couverture nationale d'une heure donnee (rendu de la carte par heure).
CREATE INDEX IF NOT EXISTS idx_weather_hourly_hour
  ON weather_hourly (hour_at);
