-- Migration 008: Alerts & Reports
-- Crée alerts, reports, dashboard_indicators.

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  type alert_type NOT NULL,
  status alert_status NOT NULL DEFAULT 'DRAFT',
  severity severity_level NOT NULL DEFAULT 'MODERATE',
  message TEXT NOT NULL,
  event_id UUID REFERENCES hazard_events(id) ON DELETE SET NULL,
  sent_by UUID REFERENCES users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  format report_format NOT NULL DEFAULT 'PDF',
  file_path VARCHAR(500),
  file_size INTEGER,
  generated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  event_id UUID REFERENCES hazard_events(id) ON DELETE SET NULL,
  parameters JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dashboard_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  label VARCHAR(255) NOT NULL,
  indicator_type VARCHAR(50) NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  position INTEGER DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_event_id ON alerts(event_id);
CREATE INDEX IF NOT EXISTS idx_reports_event_id ON reports(event_id);
