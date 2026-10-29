import { db } from '../src/config/database';

async function run() {
  // Vent violent - privilégier rafales, relever seuil modéré
  await db.query(
    `UPDATE hazard_detection_rules
     SET threshold = CASE 
       WHEN threshold < 50 THEN 50
       ELSE threshold
     END,
     updated_at = now()
     WHERE is_active = true
       AND hazard_type = 'VENT_VIOLENT'
       AND metric IN ('wind_speed_kmh','wind_speed_max_kmh','wind_gusts_kmh','wind_gusts_max_kmh')`,
  );

  // Fortes pluies - relever seuil modéré à 40
  await db.query(
    `UPDATE hazard_detection_rules
     SET threshold = CASE 
       WHEN threshold < 40 THEN 40
       ELSE threshold
     END,
     updated_at = now()
     WHERE is_active = true
       AND hazard_type = 'FORTE_PLUIE'
       AND metric IN ('rainfall_24h_mm','precipitation_sum_mm','precipitation_mm')`,
  );

  // Vague de chaleur - conserver 35 mais on pourrait exiger persistance ailleurs
  // On relève légèrement le seuil modéré si trop bas
  await db.query(
    `UPDATE hazard_detection_rules
     SET threshold = CASE 
       WHEN threshold < 35 THEN 35
       ELSE threshold
     END,
     updated_at = now()
     WHERE is_active = true
       AND hazard_type = 'VAGUE_DE_CHALEUR'
       AND metric IN ('temperature_max_c')`,
  );

  console.log('Updated detection thresholds');
  await db.end();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
