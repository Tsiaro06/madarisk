-- Migration 010: Indexes & Views
-- Crée les index GIST manquants et les vues cartographiques.
-- Adapté aux structures RÉELLES des tables existantes.
-- Toutes les vues existantes sont DROP IF EXISTS puis recréées.

-- Index GIST pour districts (si absents)
DO $$ BEGIN
  CREATE INDEX idx_districts_geom_gist ON districts USING gist(geom);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_districts_centroid_gist ON districts USING gist(centroid);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- Index GIST pour communes (si absents)
DO $$ BEGIN
  CREATE INDEX idx_communes_geom_gist ON communes USING gist(geom);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_communes_centroid_gist ON communes USING gist(centroid);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- Suppression des vues existantes pour recréation
DROP VIEW IF EXISTS v_dashboard_summary CASCADE;
DROP VIEW IF EXISTS v_pending_matching CASCADE;
DROP VIEW IF EXISTS v_event_impacted_communes CASCADE;
DROP VIEW IF EXISTS v_priority_communes CASCADE;
DROP VIEW IF EXISTS v_communes_latest_risk CASCADE;
DROP VIEW IF EXISTS v_communes_map CASCADE;
DROP VIEW IF EXISTS v_districts_map CASCADE;

-- Vue: districts avec infos région
CREATE VIEW v_districts_map AS
SELECT
  d.id,
  d.admin_code,
  d.name,
  d.normalized_name,
  d.population,
  d.vulnerability_score,
  d.geom,
  d.centroid,
  r.name AS region_name,
  d.created_at,
  d.updated_at
FROM districts d
LEFT JOIN regions r ON r.id = d.region_id;

-- Vue: communes avec infos district
CREATE VIEW v_communes_map AS
SELECT
  c.id,
  c.admin_code,
  c.name,
  c.normalized_name,
  c.postal_code,
  c.population,
  c.vulnerability_score,
  c.geom,
  c.centroid,
  d.id AS district_id,
  d.name AS district_name,
  c.created_at,
  c.updated_at
FROM communes c
LEFT JOIN districts d ON d.id = c.district_id;

-- Vue: dernière évaluation de risque par commune
CREATE VIEW v_communes_latest_risk AS
SELECT DISTINCT ON (ra.commune_id)
  ra.commune_id,
  c.name AS commune_name,
  d.name AS district_name,
  ra.risk_level,
  ra.risk_score,
  ra.phase,
  ra.explanation,
  ra.assessed_at
FROM risk_assessments ra
JOIN communes c ON c.id = ra.commune_id
JOIN districts d ON d.id = c.district_id
ORDER BY ra.commune_id, ra.assessed_at DESC;

-- Vue: communes prioritaires (risque élevé ou extrême)
CREATE VIEW v_priority_communes AS
SELECT
  c.id,
  c.name,
  c.normalized_name,
  d.name AS district_name,
  c.population,
  c.vulnerability_score,
  clr.risk_level,
  clr.risk_score,
  clr.phase,
  clr.assessed_at
FROM communes c
JOIN districts d ON d.id = c.district_id
LEFT JOIN v_communes_latest_risk clr ON clr.commune_id = c.id
WHERE clr.risk_level IN ('ELEVE', 'EXTREME')
ORDER BY clr.risk_score DESC NULLS LAST;

-- Vue: communes impactées par événement
CREATE VIEW v_event_impacted_communes AS
SELECT
  ec.event_id,
  he.name AS event_name,
  he.type AS event_type,
  he.severity,
  ec.commune_id,
  c.name AS commune_name,
  c.district_id,
  d.name AS district_name,
  ec.distance_to_track_km,
  ec.is_inside_influence_area,
  ec.exposed_population,
  clr.risk_level,
  clr.risk_score
FROM exposed_communes ec
JOIN hazard_events he ON he.id = ec.event_id
JOIN communes c ON c.id = ec.commune_id
LEFT JOIN districts d ON d.id = c.district_id
LEFT JOIN v_communes_latest_risk clr ON clr.commune_id = ec.commune_id
ORDER BY he.started_at DESC, ec.distance_to_track_km ASC;

-- Vue: matching en attente
CREATE VIEW v_pending_matching AS
SELECT
  tm.id,
  tm.source_record_id,
  sr.source_name,
  sr.normalized_name AS raw_name,
  sr.source_code AS raw_admin_code,
  tm.target_type AS territory_type,
  tm.status,
  tm.match_method AS method,
  tm.confidence_score AS confidence,
  tm.created_at
FROM territory_matching tm
JOIN source_records sr ON sr.id = tm.source_record_id
WHERE tm.status = 'EN_ATTENTE'
ORDER BY tm.created_at DESC;

-- Vue: résumé dashboard
CREATE VIEW v_dashboard_summary AS
SELECT
  (SELECT count(*) FROM districts)::int AS total_districts,
  (SELECT count(*) FROM communes)::int AS total_communes,
  (SELECT count(*) FROM users WHERE is_active = true)::int AS active_users,
  (SELECT count(*) FROM hazard_events WHERE ended_at IS NULL OR ended_at > now())::int AS active_events,
  (SELECT count(*) FROM alerts WHERE status IN ('BROUILLON', 'PUBLIEE'))::int AS active_alerts,
  (SELECT count(*) FROM risk_assessments WHERE risk_level IN ('ELEVE', 'EXTREME'))::int AS high_risk_communes;
