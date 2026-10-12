import pg from 'pg';
import { env } from '../../src/config/env';

async function main() {
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, ssl: false });

  const ev = await pool.query(
    "SELECT id, event_code, name, status, severity, started_at, ended_at, source_name FROM hazard_events WHERE event_code = 'HIST-BATSIRAI-2022'",
  );
  console.log('event:', ev.rows[0]);
  const eventId = ev.rows[0].id as string;

  for (const [label, sql] of [
    ['tracks', 'SELECT count(*)::int n FROM event_tracks WHERE event_id = $1'],
    ['areas', 'SELECT count(*)::int n FROM event_areas WHERE event_id = $1'],
    ['bulletins', 'SELECT count(*)::int n FROM weather_bulletins WHERE event_id = $1'],
    ['alerts', 'SELECT count(*)::int n FROM alerts WHERE event_id = $1'],
    ['historical alerts', 'SELECT count(*)::int n FROM alerts WHERE event_id = $1 AND is_historique = true'],
    ['archived alerts', "SELECT count(*)::int n FROM alerts WHERE event_id = $1 AND status = 'ARCHIVEE'"],
    ['reports', 'SELECT count(*)::int n FROM reports WHERE event_id = $1'],
    ['historical reports', 'SELECT count(*)::int n FROM reports WHERE event_id = $1 AND is_historique = true'],
    ['status history', 'SELECT count(*)::int n FROM event_status_history WHERE event_id = $1'],
  ] as const) {
    const r = await pool.query(sql, [eventId]);
    console.log(`  ${label}: ${r.rows[0].n}`);
  }

  const areaSample = await pool.query(
    'SELECT risk_level, source_type, is_estimate, description FROM event_areas WHERE event_id = $1 ORDER BY risk_level LIMIT 3',
    [eventId],
  );
  console.log('area sample:', areaSample.rows);

  const alertSample = await pool.query(
    'SELECT severity, status, is_historique, title FROM alerts WHERE event_id = $1 LIMIT 2',
    [eventId],
  );
  console.log('alert sample:', alertSample.rows);

  const bulletins = await pool.query(
    'SELECT title, alert_level, source_name FROM weather_bulletins WHERE event_id = $1 ORDER BY published_at',
    [eventId],
  );
  console.log('bulletins:', bulletins.rows);

  const reports = await pool.query(
    'SELECT title, source, is_historique FROM reports WHERE event_id = $1',
    [eventId],
  );
  console.log('reports:', reports.rows);

  await pool.end();
}

void main();
