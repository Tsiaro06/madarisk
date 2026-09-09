-- Migration 011: Functions & Triggers

CREATE OR REPLACE FUNCTION normalize_territory_name(input_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result TEXT;
BEGIN
  result := unaccent(input_name);
  result := upper(result);
  result := regexp_replace(result, '[^A-Z0-9\s]', ' ', 'g');
  result := regexp_replace(result, '\bCOMMUNE\b', '', 'g');
  result := regexp_replace(result, '\bDISTRICT\b', '', 'g');
  result := regexp_replace(result, '\bDE\b', '', 'g');
  result := regexp_replace(result, '\bDU\b', '', 'g');
  result := regexp_replace(result, '\bDES\b', '', 'g');
  result := regexp_replace(result, '\s+', ' ', 'g');
  result := trim(result);
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON organizations;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON users;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON hazard_events;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON hazard_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON weather_sources;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON weather_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON risk_configurations;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON risk_configurations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON alerts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON alerts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON ai_conversations;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON ai_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON districts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON districts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON communes;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON communes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON regions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON regions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
