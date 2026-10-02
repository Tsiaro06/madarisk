-- Migration 020 : compteur de quota quotidien Open-Meteo
-- Additive uniquement : aucune suppression, aucune donnee modifiee.
--
-- Pourquoi une table alors que le compteur tient en memoire :
--   un compteur en memoire oublie tout au redemarrage du service. Or c'est
--   precisement le moment ou il compte : l'API qui redemarre a 14h ne doit pas
--   repartir de zero et s'autoriser 4 runs nationaux de plus dans la journee.
--   Le compteur survit donc au redemarrage, et se rebat tout seul quand le jour
--   change.
--
-- Open-Meteo rebatt son compteur a 00:00 UTC (03:00 heure Madagascar) : la
-- colonne `quota_day` est donc une date UTC, pas une date locale.

CREATE TABLE IF NOT EXISTS weather_provider_quota (
  provider       TEXT PRIMARY KEY,
  quota_day      DATE NOT NULL,
  -- NUMERIC et non INTEGER : le cout d'un appel est pondere (jours x variables),
  -- un run national coute environ 1421,4 appels. Entier, on cumulerait une
  -- erreur de presque un appel par run.
  consumed_calls NUMERIC(10,2) NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE weather_provider_quota IS
  'Consommation approchee du quota quotidien Open-Meteo, par fournisseur et par jour UTC.';
COMMENT ON COLUMN weather_provider_quota.consumed_calls IS
  'Appels cumules depuis 00:00 UTC. Estimations commanders avant envoi reel, pour ne jamais depasser le plafond gratuit.';
