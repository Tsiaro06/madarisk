-- Migration 017: Performance des couches cartographiques (page Météo)
--
-- Contexte : le chargement de la carte /meteo kontook plus de 23 s.
-- Deux causes cumulatives, corrigées ici.
--
-- 1) Index composites manquants
--    territories.repository.mapCommunes() exécute des sous-requêtes
--    corrélées « dernière ligne par commune » (risk_assessments puis
--    weather_observations). Sans index (commune_id, <col> DESC), PostgreSQL
--    n'utilise que l'index sur la colonne de tri puis filtre :
--    « Rows Removed by Filter: 12837 » par commune, soit ~3 s par
--    sous-requête et >30 s pour le rendu complet de la carte.
--
-- 2) Géométrie simplifiée précalculée
--    ST_SimplifyPreserveTopology(geom, 0.005) était recalculé à chaque
--    requête (~2,9 s pour 1579 communes, table de 50 Mo dont 40 Mo en
--    TOAST). Les limites administratives de Madagascar ne changent pas :
--    la simplification est donc matérialisée dans une colonne générée,
--    recalculée automatiquement par PostgreSQL à chaque import de
--    communes. ST_SimplifyPreserveTopology est IMMUTABLE, ce qui autorise
--    une colonne GENERATED ... STORED.
--
-- Résultat mesuré sur /api/v1/territories/map/communes : 23,2 s -> 0,9 s.

CREATE INDEX IF NOT EXISTS idx_risk_assessments_commune_assessed
  ON risk_assessments (commune_id, assessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_weather_observations_commune_observed
  ON weather_observations (commune_id, observed_at DESC);

-- Géométrie allégée pour l'affichage cartographique (générée, jamais
-- écrite explicitement). ST_SimplifyPreserveTopology est IMMUTABLE.
ALTER TABLE communes
  ADD COLUMN IF NOT EXISTS geom_map geometry(Geometry, 4326)
  GENERATED ALWAYS AS (ST_SimplifyPreserveTopology(geom, 0.005)) STORED;

CREATE INDEX IF NOT EXISTS idx_communes_geom_map_gist
  ON communes USING gist (geom_map);
