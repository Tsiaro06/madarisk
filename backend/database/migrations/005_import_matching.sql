-- Migration 005: Import Matching
-- Crée matching_rules, territory_matching.

CREATE TABLE IF NOT EXISTS matching_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  method matching_method NOT NULL DEFAULT 'FUZZY',
  similarity_threshold NUMERIC(3,2) DEFAULT 0.70,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER DEFAULT 0,
  config JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS territory_matching (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_record_id UUID NOT NULL REFERENCES source_records(id) ON DELETE CASCADE,
  matched_territory_id UUID,
  territory_type territory_type NOT NULL,
  status matching_status NOT NULL DEFAULT 'PENDING',
  method matching_method,
  confidence NUMERIC(5,4),
  rule_id UUID REFERENCES matching_rules(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_matching_rules_method ON matching_rules(method);
CREATE INDEX IF NOT EXISTS idx_territory_matching_source ON territory_matching(source_record_id);
CREATE INDEX IF NOT EXISTS idx_territory_matching_status ON territory_matching(status);
CREATE INDEX IF NOT EXISTS idx_territory_matching_territory ON territory_matching(territory_type, matched_territory_id);
