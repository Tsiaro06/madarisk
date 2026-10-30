import { db } from './src/config/database.ts';
const r = await db.query('select hazard_type, metric, operator, threshold, threshold_max, severity_rules from hazard_detection_rules where is_active = true order by hazard_type, metric');
for (const row of r.rows) {
  console.log(row.hazard_type + '|' + row.metric + '|' + row.operator + '|' + row.threshold + '|' + (row.threshold_max ?? '') + '|' + JSON.stringify(row.severity_rules));
}
await db.end();
process.exit(0);
