-- Migration 016: alertes automatiques pilotées par les événements

-- Colonnes sur alerts
ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES regions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source VARCHAR(150),
  ADD COLUMN IF NOT EXISTS basis VARCHAR(20),
  ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_automatic BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS update_count INTEGER NOT NULL DEFAULT 0;

-- Historique des mises à jour d alertes
CREATE TABLE IF NOT EXISTS alert_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  kind VARCHAR(20) NOT NULL,
  from_status alert_status,
  to_status alert_status,
  trigger VARCHAR(20) NOT NULL,
  auto_publish BOOLEAN NOT NULL DEFAULT false,
  old_title TEXT,
  new_title TEXT,
  old_message TEXT,
  new_message TEXT,
  old_severity severity_level,
  new_severity severity_level,
  old_basis VARCHAR(20),
  new_basis VARCHAR(20),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_alerts_is_automatic ON alerts(is_automatic);
CREATE INDEX IF NOT EXISTS idx_alerts_region_id ON alerts(region_id);
CREATE INDEX IF NOT EXISTS idx_alert_updates_alert_id ON alert_updates(alert_id, recorded_at DESC);
