import { loadDemoContext } from './demo-env';

/**
 * Initialise le scénario « Cyclone simulé en Analanjirofo » dans la base de démonstration.
 * Exécute d'abord le seed de base (organisation, configuration de risque,
 * utilisateurs) puis reconstruit le scénario de manière idempotente.
 */
export async function runScenarioSeed(): Promise<void> {
  const ctx = await loadDemoContext();

  const { runBaseSeed } = await import('../seed');
  await runBaseSeed();

  const { demoScenarioService } = await import('../../../src/services/demo-scenario.service');
  const { db } = await import('../../../src/config/database');

  try {
    const state = await demoScenarioService.seed();
    console.log('\n--- Scénario de démonstration prêt ---');
    console.log(`  Base        : ${ctx.dbName}`);
    console.log(`  Événement   : ${state.event?.name ?? DEMO_PLACEHOLDER}`);
    console.log(`  Code        : ${state.event?.eventCode ?? DEMO_PLACEHOLDER}`);
    console.log(`  Étape       : ${state.step ?? 'aucune'}`);
    console.log(`  Trajectoires: ${state.counts.tracks}`);
    console.log(`  Zones       : ${state.counts.areas}`);
    console.log(`  Communes exposées : ${state.counts.exposedCommunes}`);
    console.log(`  Évaluations risque: ${state.counts.risks}`);
    console.log(`  Alertes     : ${state.counts.alerts}`);
  } finally {
    await db.pool.end();
  }
}

const DEMO_PLACEHOLDER = 'SCÉNARIO DE DÉMONSTRATION — Cyclone simulé en Analanjirofo';

const entry = process.argv[1];
const invokedDirectly = entry ? /seed-scenario\.(ts|js)$/.test(entry) : false;

if (invokedDirectly) {
  runScenarioSeed().catch((err) => {
    console.error('\nSeed du scénario échoué :', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
