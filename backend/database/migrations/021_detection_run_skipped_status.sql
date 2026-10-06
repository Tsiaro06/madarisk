-- Migration 021 : statut SKIPPED pour l'enum automation_run_status.
-- Additive uniquement : aucune suppression, aucune donnee modifiee.
-- Une execution de detection sans regle active est actuellement retournee en
-- silence (aucune ligne creee) : on autorise un statut explicite pour tracer
-- ces sauts dans hazard_detection_runs.

ALTER TYPE automation_run_status ADD VALUE IF NOT EXISTS 'SKIPPED';
