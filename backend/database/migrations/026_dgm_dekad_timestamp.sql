-- Migration 026 : horodatage correct des cumuls décadaires DGM.
--
-- La fin de décade était construite avec `Date.UTC(..., 23, 59, 59)`, donc
-- stockée à 23:59:59 UTC — soit 02:59:59 le lendemain en heure de Madagascar
-- (UTC+3). Trois conséquences observées en production :
--   * la DGM, qui publie un CUMUL sur 10 jours, apparaissait comme la source la
--     plus fraîche de la base (`MAX(observed_at)` toutes sources confondues) et
--     le bandeau de monitoring annonçait des données fraîches ;
--   * une décade close le 20/10 était datée du 21/10, parfois jusqu'à 9 jours
--     dans le futur par rapport à l'ingestion ;
--   * le libellé de la décade, dérivé du jour local, pouvait désigner la
--     mauvaise période.
--
-- La correction applicative date désormais la fin de décade à 20:59:59 UTC
-- (= 23:59:59 heure locale). Cette migration aligne les lignes déjà écrites.
-- Elle est idempotente : le filtre `time = '23:59:59'` ne matche que l'ancien
-- format.
--
-- Aucune donnée n'est supprimée hormis un éventuel doublon exact : si la même
-- décade existe déjà au bon horodatage (ingestion corrigée), l'UPDATE violerait
-- l'index unique (source, commune, observed_at, event_id).

-- 1. Doublons : la version mal horodatée est redondante.
DELETE FROM weather_observations w
USING weather_sources s
WHERE s.id = w.weather_source_id
  AND s.provider_type = 'DGM_MAPROOM'
  AND w.commune_id IS NOT NULL
  AND (w.observed_at AT TIME ZONE 'UTC')::time = '23:59:59'
  AND EXISTS (
    SELECT 1
      FROM weather_observations x
     WHERE x.weather_source_id = w.weather_source_id
       AND x.commune_id = w.commune_id
       AND x.event_id IS NOT DISTINCT FROM w.event_id
       AND x.observed_at = w.observed_at - interval '3 hours'
  );

-- 2. Décalage des lignes restantes vers la vraie fin de journée locale.
UPDATE weather_observations w
SET observed_at = w.observed_at - interval '3 hours'
FROM weather_sources s
WHERE s.id = w.weather_source_id
  AND s.provider_type = 'DGM_MAPROOM'
  AND (w.observed_at AT TIME ZONE 'UTC')::time = '23:59:59';
