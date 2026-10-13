-- Migration 024 : méthode d'impact communale en TEXT
--
-- Les descriptions de méthode (calcul PostGIS, tolérance du corridor,
-- interpolation du passage du centre, lignes d'impact documentées) dépassent
-- régulièrement VARCHAR(255) : passage en TEXT, plus adapté à un champ de
-- traçabilité (jamais supposé être une clé / un libellé court).

ALTER TABLE event_commune_impacts
  ALTER COLUMN method TYPE TEXT;