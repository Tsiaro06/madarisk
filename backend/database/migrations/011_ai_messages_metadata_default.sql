-- Migration 011: AI — défaut sur metadata des messages
-- La table ai_messages.metadata est NOT NULL : on garantit un défaut pour toute écriture future.

ALTER TABLE ai_messages
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;