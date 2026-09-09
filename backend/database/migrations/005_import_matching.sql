-- Migration 005: Matching territorial

CREATE TABLE IF NOT EXISTS territory_matching (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_record_id UUID NOT NULL REFERENCES source_records(id) ON DELETE CASCADE,
  target_type territory_type,
  region_id UUID REFERENCES regions(id) ON DELETE SET NULL,
  district_id UUID REFERENCES districts(id) ON DELETE SET NULL,
  commune_id UUID REFERENCES communes(id) ON DELETE SET NULL,
  match_method matching_method,
  confidence_score NUMERIC(6,2),
  status matching_status NOT NULL DEFAULT 'EN_ATTENTE',
  notes TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_territory_matching_source ON territory_matching(source_record_id);
CREATE INDEX IF NOT EXISTS idx_territory_matching_status ON territory_matching(status);
CREATE INDEX IF NOT EXISTS idx_territory_matching_district ON territory_matching(district_id);
CREATE INDEX IF NOT EXISTS idx_territory_matching_commune ON territory_matching(commune_id);
