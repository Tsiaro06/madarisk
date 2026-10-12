-- Migration 022 : tracabilite des donnees historiques (evenements passes
-- importes, tels que le cyclone Batsirai de fevrier 2022).
--
-- Objectif : distinguer explicitement les donnees historiques des donnees
-- operationnelles temps reel, sans jamais transformer un evenement passe en
-- alerte active.
--
-- Additif et reversible : aucune table existante n'est modifiee en profondeur,
-- aucune donnee n'est supprimee.

-- ── Alerts ──────────────────────────────────────────────────────────────────
-- Une alerte importee depuis un bulletin archive est purement historique :
-- elle ne doit jamais compter comme active ni declencher de notification.
ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS is_historique BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_alerts_is_historique
  ON alerts (is_historique);

-- ── Reports ─────────────────────────────────────────────────────────────────
-- Un rapport de situation historique porte sa source et son caractere passe.
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS source VARCHAR(255),
  ADD COLUMN IF NOT EXISTS is_historique BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_reports_is_historique
  ON reports (is_historique);

-- ── weather_bulletins ───────────────────────────────────────────────────────
-- Bulletins meteorologiques historiques (ex. bulletins cycloniques officiels).
-- Table dediee : ces bulletins ne sont PAS des observations temps reel et ne
-- doivent jamais alimenter la carte meteo courante ni les jobs de synchro.
CREATE TABLE IF NOT EXISTS weather_bulletins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES hazard_events(id) ON DELETE CASCADE,
  source_name VARCHAR(255) NOT NULL,
  source_url TEXT,
  -- Numero/identifiant du bulletin tel que publie par l'emetteur.
  bulletin_ref VARCHAR(150),
  title VARCHAR(500) NOT NULL,
  -- Date et heure d'emission du bulletin (donnee source).
  published_at TIMESTAMPTZ NOT NULL,
  -- Date et heure de validite/observation decrite par le bulletin.
  observed_at TIMESTAMPTZ,
  -- Position decrite en clair lorsque le bulletin ne fournit pas de coordonnee.
  position_description TEXT,
  latitude NUMERIC(10,6),
  longitude NUMERIC(10,6),
  wind_kmh NUMERIC(8,2),
  gust_kmh NUMERIC(8,2),
  pressure_hpa NUMERIC(8,2),
  movement_direction VARCHAR(50),
  movement_speed_kmh NUMERIC(8,2),
  -- Niveau d'alerte global du bulletin (ex. VERTE, JAUNE, ROUGE...).
  alert_level VARCHAR(30),
  -- Detail des niveaux par zone/region, tel que publie.
  alert_levels JSONB,
  -- Corps du bulletin (texte integral source).
  content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT weather_bulletins_source_ref_unique
    UNIQUE (source_name, published_at, title)
);

CREATE INDEX IF NOT EXISTS idx_weather_bulletins_event
  ON weather_bulletins (event_id);
CREATE INDEX IF NOT EXISTS idx_weather_bulletins_published
  ON weather_bulletins (published_at DESC);
