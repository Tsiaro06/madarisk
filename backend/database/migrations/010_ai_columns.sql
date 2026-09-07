-- Migration 010: AI — alignement schéma
-- Ajoute les colonnes manquantes (la migration 009 avait été appliquée sans elles).

ALTER TABLE ai_conversations
  ADD COLUMN IF NOT EXISTS model VARCHAR(100);

ALTER TABLE ai_messages
  ADD COLUMN IF NOT EXISTS token_count INTEGER;