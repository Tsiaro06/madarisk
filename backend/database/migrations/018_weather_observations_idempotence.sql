-- Migration 018: Idempotence des observations meteorologiques
--
-- Contexte : `weatherRepository.insertObservations()` termine ses lots par
-- `ON CONFLICT DO NOTHING`, mais `weather_observations` n'avait AUCUN index
-- unique sur ses colonnes naturelles. La clause ne pouvait donc jamais etre
-- satisfaite : chaque passage du job insertait 1 579 lignes de plus par
-- source, et le `ON CONFLICT DO NOTHING` ne protégeait rien.
--
-- Effet aggravant : les lignes DGM sont maintenant horodatées au dernier jour
-- complet de décade (et non plus à l'heure d'ingestion). Toutes les
-- ingestions d'une même décade visent donc la MEME valeur `observed_at`, si
-- bien que la table grossissait de 1 579 lignes PAR HEURE, indéfiniment.
--
-- `weather_forecasts` est déjà protégé (`uq_weather_forecasts_commune_day`) :
-- le défaut est propre aux observations.
--
-- Clé naturelle retenue :
--   (weather_source_id, commune_id, observed_at, event_id)
--   - event_id distingue une observation rattachée à un événement de
--     l'observation nationale du même point et du même instant ;
--   - NULLS NOT DISTINCT (PostgreSQL 15+) est INDISPENSABLE ici : les lignes
--     nationales portent event_id = NULL, et en index unique classique les
--     NULL sont tous considérés comme distincts. Sans cette option, les
--     lignes nationales — de très loin les plus nombreuses — resteraient
--     dupliquées indéfiniment.
--
-- Déduplication : pour chaque clé, on conserve la ligne la plus récemment
-- ingérée (created_at, puis id), donc la plus à jour.

DELETE FROM weather_observations o
WHERE o.id IN (
  SELECT id
  FROM (
    SELECT id,
           row_number() OVER (
             PARTITION BY weather_source_id, commune_id, observed_at, event_id
             ORDER BY created_at DESC, id DESC
           ) AS rn
    FROM weather_observations
  ) t
  WHERE t.rn > 1
);

-- Rend désormais `ON CONFLICT DO NOTHING` effectif dans insertObservations() :
-- les ré-ingestions d'une décade déjà connue ne recréent plus de lignes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_weather_observations_source_commune_observed
  ON weather_observations (weather_source_id, commune_id, observed_at, event_id)
  NULLS NOT DISTINCT;