-- Migration 014 : Moteur de détection d'événements — clés de déduplication et suivi de danger décroissant
-- Additive uniquement : aucune suppression, aucune donnée modifiée.

-- ── event_detection_keys ───────────────────────────────────────────────────
-- Chaque aléa détecté est rattaché à un événement via une clé stable
-- (hazardType:portée). Une nouvelle détection sur la même clé réutilise
-- l'événement existant non clôturé (pas de doublon).
CREATE TABLE IF NOT EXISTS event_detection_keys (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id       UUID         NOT NULL REFERENCES hazard_events(id) ON DELETE CASCADE,
  detection_key  VARCHAR(120) NOT NULL,
  first_seen_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_seen_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (event_id, detection_key)
);

CREATE INDEX IF NOT EXISTS idx_event_detection_keys_key
  ON event_detection_keys (detection_key, last_seen_at DESC);

-- ── event_monitoring ───────────────────────────────────────────────────────
-- Suivi de l'évolution du danger : nombre de cycles normaux consécutifs
-- (ACTIF → SUIVI) et durée du suivi (SUIVI → CLOTURE).
CREATE TABLE IF NOT EXISTS event_monitoring (
  event_id                    UUID PRIMARY KEY REFERENCES hazard_events(id) ON DELETE CASCADE,
  detection_key               VARCHAR(120) NOT NULL,
  consecutive_normal_cycles   INTEGER      NOT NULL DEFAULT 0,
  monitoring_since            TIMESTAMPTZ,
  last_detected_at            TIMESTAMPTZ,
  last_evaluated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CHECK (consecutive_normal_cycles >= 0)
);

CREATE INDEX IF NOT EXISTS idx_event_monitoring_key_time
  ON event_monitoring (detection_key, last_detected_at DESC);