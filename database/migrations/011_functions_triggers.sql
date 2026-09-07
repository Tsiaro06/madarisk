-- Migration 011: Functions & Triggers
-- Crée la fonction normalize_territory_name et les triggers updated_at.

-- Fonction de normalisation des noms de territoire
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

-- Fonction générique pour triggers updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Triggers updated_at sur les tables qui ont une colonne updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON matching_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON territory_matching
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON hazard_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON weather_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON risk_configurations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON risk_assessments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON alerts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON dashboard_indicators
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON ai_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON districts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON communes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
