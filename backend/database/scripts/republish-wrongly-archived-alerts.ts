import 'dotenv/config';
import { db } from '../../src/config/database';

function parseFlag(): boolean {
  return process.argv.includes('--dry-run');
}

interface Row {
  id: string;
  title: string;
  is_automatic: boolean;
  is_historique: boolean;
  event_id: string | null;
  event_status: string | null;
  archived_manually_at: string | null;
  expires_at: string | null;
  valid_from: string | null;
  published_at: string | null;
}

async function main() {
  const dryRun = parseFlag();
  if (dryRun) {
    console.log('[dry-run] Aucune modification en base.');
  }

  const result = await db.query<Row>(
    `SELECT
       a.id,
       a.title,
       a.is_automatic,
       a.is_historique,
       a.event_id,
       e.status AS event_status,
       a.archived_manually_at,
       a.expires_at,
       a.valid_from,
       a.published_at
     FROM alerts a
     LEFT JOIN hazard_events e ON e.id = a.event_id
     WHERE a.status = 'ARCHIVEE'
       AND a.is_historique = false
       AND a.published_at IS NOT NULL
       AND (a.expires_at IS NULL OR a.expires_at > now())
       AND a.archived_manually_at IS NULL
       AND (a.event_id IS NULL OR e.status <> 'CLOTURE')
       AND (a.event_id IS NOT NULL OR a.is_automatic = false)
     ORDER BY a.created_at ASC`,
  );

  console.log(`Candidats à republier : ${result.rows.length}`);
  for (const row of result.rows.slice(0, 25)) {
    const evt = row.event_id ? `evt:${row.event_id.slice(0, 8)}[${row.event_status}]` : 'GLOBAL';
    console.log(` - ${row.id} | ${row.is_automatic ? 'AUTO' : 'MANUEL'} | ${evt} | ${row.title}`);
  }
  if (result.rows.length > 25) {
    console.log(` ... et ${result.rows.length - 25} autres`);
  }

  if (dryRun || result.rows.length === 0) {
    await db.pool.end();
    return;
  }

  const ids = result.rows.map((r) => r.id);
  const update = await db.query(
    `UPDATE alerts SET status = 'PUBLIEE', updated_at = now(), archived_manually_at = NULL WHERE id = ANY($1::uuid[])`,
    [ids],
  );
  console.log(`Republiées : ${update.rowCount ?? ids.length}`);
  await db.pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
