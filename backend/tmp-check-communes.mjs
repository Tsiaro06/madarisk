import pg from 'pg';

const { Client } = pg;
const c = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5432/mada_risk' });
await c.connect();

const q = async (sql, params) => (await c.query(sql, params)).rows;

console.log('--- event_detection_communes ---');
console.table(
  await q(
    `SELECT he.name AS evenement, he.type, cm.name AS commune, edc.metric, edc.value, edc.threshold, edc.severity, edc.recorded_at
     FROM event_detection_communes edc
     JOIN hazard_events he ON he.id = edc.event_id
     JOIN communes cm ON cm.id = edc.commune_id
     ORDER BY he.name, edc.severity DESC NULLS LAST, cm.name`
  )
);

console.log('--- hazard_events ---');
console.table(
  await q(
    `SELECT name, type, status, severity, started_at, created_at
     FROM hazard_events
     ORDER BY created_at DESC LIMIT 15`
  )
);

console.log('--- matching_rules (severity) ---');
console.table(await q(`SELECT * FROM matching_rules ORDER BY id LIMIT 40`));

await c.end();
