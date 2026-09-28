-- Migration 004: Régions / districts / communes + imports / aliases
-- Les données SIG (119 districts / 1579 communes) sont chargées hors migrations.

CREATE TABLE IF NOT EXISTS regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  normalized_name VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS districts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID REFERENCES regions(id) ON DELETE SET NULL,
  admin_code VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  normalized_name VARCHAR(255) NOT NULL,
  population INTEGER,
  vulnerability_score NUMERIC(8,2),
  geom GEOMETRY(MultiPolygon, 4326),
  centroid GEOMETRY(Point, 4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS communes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  district_id UUID NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
  admin_code VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  normalized_name VARCHAR(255) NOT NULL,
  postal_code VARCHAR(20),
  population INTEGER,
  vulnerability_score NUMERIC(8,2),
  geom GEOMETRY(MultiPolygon, 4326),
  centroid GEOMETRY(Point, 4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS territory_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  territory_type territory_type NOT NULL,
  district_id UUID REFERENCES districts(id) ON DELETE CASCADE,
  commune_id UUID REFERENCES communes(id) ON DELETE CASCADE,
  alias VARCHAR(255) NOT NULL,
  normalized_alias VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT territory_aliases_target_chk CHECK (
    (territory_type = 'DISTRICT' AND district_id IS NOT NULL AND commune_id IS NULL)
    OR (territory_type = 'COMMUNE' AND commune_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS territory_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imported_by UUID REFERENCES users(id) ON DELETE SET NULL,
  file_name VARCHAR(500) NOT NULL,
  file_path TEXT,
  file_type import_file_type NOT NULL,
  territory_type territory_type,
  coordinate_system VARCHAR(100),
  status import_status NOT NULL DEFAULT 'BROUILLON',
  total_records INTEGER NOT NULL DEFAULT 0,
  valid_records INTEGER NOT NULL DEFAULT 0,
  invalid_records INTEGER NOT NULL DEFAULT 0,
  error_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS source_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES territory_imports(id) ON DELETE CASCADE,
  external_reference VARCHAR(255),
  source_name VARCHAR(255),
  normalized_name VARCHAR(255),
  source_code VARCHAR(100),
  source_district VARCHAR(255),
  source_region VARCHAR(255),
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_districts_normalized ON districts(normalized_name);
CREATE INDEX IF NOT EXISTS idx_districts_admin_code ON districts(admin_code);
CREATE INDEX IF NOT EXISTS idx_communes_district ON communes(district_id);
CREATE INDEX IF NOT EXISTS idx_communes_normalized ON communes(normalized_name);
CREATE INDEX IF NOT EXISTS idx_communes_admin_code ON communes(admin_code);
CREATE INDEX IF NOT EXISTS idx_territory_aliases_normalized ON territory_aliases(normalized_alias);
CREATE INDEX IF NOT EXISTS idx_territory_imports_status ON territory_imports(status);
CREATE INDEX IF NOT EXISTS idx_source_records_import_id ON source_records(import_id);
