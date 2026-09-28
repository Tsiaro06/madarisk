-- Migration 001: Extensions
-- Crée les extensions PostgreSQL nécessaires si absentes.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS unaccent;
