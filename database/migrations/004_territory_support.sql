-- Migration 004: Territory Support
-- Crée territory_aliases, territory_imports, source_records.
-- Les tables districts et communes existent déjà et ne sont PAS modifiées.

CREATE TABLE IF NOT EXISTS territory_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  territory_type territory_type NOT NULL,
  territory_id UUID NOT NULL,
  alias_name VARCHAR(255) NOT NULL,
  normalized_alias VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS territory_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename VARCHAR(500) NOT NULL,
  file_hash VARCHAR(64),
  record_count INTEGER DEFAULT 0,
  status import_status NOT NULL DEFAULT 'PENDING',
  error_message TEXT,
  imported_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS source_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID REFERENCES territory_imports(id) ON DELETE CASCADE,
  raw_name VARCHAR(255) NOT NULL,
  raw_admin_code VARCHAR(100),
  territory_type territory_type NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_territory_aliases_territory ON territory_aliases(territory_type, territory_id);
CREATE INDEX IF NOT EXISTS idx_territory_aliases_normalized ON territory_aliases(normalized_alias);
CREATE INDEX IF NOT EXISTS idx_territory_imports_status ON territory_imports(status);
CREATE INDEX IF NOT EXISTS idx_source_records_import_id ON source_records(import_id);
