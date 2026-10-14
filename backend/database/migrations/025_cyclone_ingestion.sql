-- Migration 025 : ingestion automatique d'un cyclone actif.
--
-- Deux sources complémentaires :
--  • GDACS (veille) — détecte les cyclones actifs, leur niveau d'alerte et les
--    pays concernés, avant qu'IBTrACS ne publie quoi que ce soit ;
--  • IBTrACS v04r01 (NCEI) — trajectoire officielle et rayons de vent
--    R34/R50/R64 documentés par la RSMC La Réunion (Météo-France), agence
--    WMO du bassin. C'est exactement la source utilisée pour Batsirai 2022.
--
-- Additif et réversible : aucune colonne ni donnée existante n'est supprimée.
--
-- Objet : rendre l'ingestion rejouable sans doublon. Avant cette migration,
-- `event_tracks` n'avait AUCUNE contrainte d'unicité : rejouer la
-- synchronisation dupliquait tout l'historique de trajectoire. On ajoute deux
-- index uniques PARTIELS (un par nature de piste) qui ne gênent pas les pistes
-- de prévision, puis deux tables de service : correspondance source -> événement
-- (`cyclone_systems`) et journal des cycles (`cyclone_sync_runs`).

-- ── 1. Idempotence des points de trajectoire ────────────────────────────────
-- `ON CONFLICT` d'un UPSERT ne peut cibler qu'un index UNIQUE : ces index
-- partiels sont le support de l'idempotence. Ils ne sont créés que si les
-- données existantes sont déjà cohérentes (aucun doublon), pour ne jamais faire
-- échouer la migration sur une base de développement.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'uq_event_tracks_observed') THEN
    IF NOT EXISTS (
      SELECT 1 FROM event_tracks
       WHERE track_type = 'OBSERVEE'
       GROUP BY event_id, observed_at
      HAVING COUNT(*) > 1
       LIMIT 1
    ) THEN
      CREATE UNIQUE INDEX uq_event_tracks_observed
        ON event_tracks (event_id, observed_at)
        WHERE track_type = 'OBSERVEE';
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'uq_event_tracks_forecast') THEN
    IF NOT EXISTS (
      SELECT 1 FROM event_tracks
       WHERE track_type = 'PREVUE' AND forecast_for IS NOT NULL
       GROUP BY event_id, forecast_for, observed_at
      HAVING COUNT(*) > 1
       LIMIT 1
    ) THEN
      CREATE UNIQUE INDEX uq_event_tracks_forecast
        ON event_tracks (event_id, forecast_for, observed_at)
        WHERE track_type = 'PREVUE';
    END IF;
  END IF;
END $$;

-- ── 2. cyclone_systems : identité d'un système -> événement ─────────────────
-- Un cyclone conserve un `event_code` stable d'un cycle à l'autre, même si son
-- nom change (renommage RSMC) : la correspondance est portée ici, par
-- (source, identifiant source). Une même tempête peut être liée à la fois à sa
-- veille GDACS et à sa trajectoire IBTrACS : les deux lignes pointent alors vers
-- le MÊME événement, ce qui évite un doublon lors de l'arrivée tardive d'IBTrACS.
CREATE TABLE IF NOT EXISTS cyclone_systems (
  id                UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id          UUID          NOT NULL REFERENCES hazard_events(id) ON DELETE CASCADE,
  source            VARCHAR(40)   NOT NULL,   -- IBTRACS | GDACS
  source_system_id  VARCHAR(120)  NOT NULL,   -- SID IBTrACS (2022024S09090) ou eventid:episodeid GDACS
  name              VARCHAR(255),
  basin             VARCHAR(20),
  season            INTEGER,
  source_url        TEXT,
  alert_level       VARCHAR(20),
  max_wind_kmh      NUMERIC(6, 1),
  first_seen_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  last_seen_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  raw_metadata      JSONB         NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT cyclone_systems_source_id_unique UNIQUE (source, source_system_id)
);

CREATE INDEX IF NOT EXISTS idx_cyclone_systems_event
  ON cyclone_systems (event_id);

CREATE INDEX IF NOT EXISTS idx_cyclone_systems_last_seen
  ON cyclone_systems (source, last_seen_at DESC);

-- Fonction `update_updated_at_column()` : créée par la migration 011, seule
-- fonction de trigger réellement définie par les migrations (le nom
-- `set_updated_at` y désigne les *triggers*, pas une fonction).
DROP TRIGGER IF EXISTS set_updated_at ON cyclone_systems;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON cyclone_systems
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 3. cyclone_sync_runs : observabilité des cycles d'ingestion ─────────────
-- Calquée sur `weather_sync_runs` : on doit pouvoir dire quand le dernier cycle
-- a tourné, combien de systèmes il a vus et s'il a échoué.
CREATE TABLE IF NOT EXISTS cyclone_sync_runs (
  id                UUID                  DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at        TIMESTAMPTZ           NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ,
  status            automation_run_status NOT NULL DEFAULT 'RUNNING',
  trigger           VARCHAR(20)           NOT NULL DEFAULT 'SCHEDULED', -- SCHEDULED | MANUAL
  sources           VARCHAR(120)          NOT NULL DEFAULT 'IBTRACS+GDACS',
  systems_detected  INTEGER               NOT NULL DEFAULT 0,
  systems_tracked   INTEGER               NOT NULL DEFAULT 0,
  events_created    INTEGER               NOT NULL DEFAULT 0,
  events_updated    INTEGER               NOT NULL DEFAULT 0,
  track_points      INTEGER               NOT NULL DEFAULT 0,
  errors_count      INTEGER               NOT NULL DEFAULT 0,
  error_message     TEXT,
  details           JSONB                 NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ           NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cyclone_sync_runs_time
  ON cyclone_sync_runs (started_at DESC);
