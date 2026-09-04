import { systemRepository } from '../../src/repositories/system.repository';
import { db } from '../../src/config/database';

async function main(): Promise<void> {
  console.log('--- Diagnostic base de données MadaRisk ---\n');

  try {
    const report = await systemRepository.getDatabaseStatus();

    console.log(JSON.stringify(report, null, 2));

    if (!report.databaseConnected) {
      console.error('\n[ERREUR] Impossible de se connecter à la base de données.');
      process.exit(1);
    }

    if (!report.postgisEnabled) {
      console.error('\n[AVERTISSEMENT] L\'extension PostGIS n\'est pas installée.');
    }

    if (report.invalidDistrictGeometries > 0) {
      console.error(`\n[AVERTISSEMENT] ${report.invalidDistrictGeometries} géométrie(s) invalide(s) dans districts.`);
    }

    if (report.invalidCommuneGeometries > 0) {
      console.error(`\n[AVERTISSEMENT] ${report.invalidCommuneGeometries} géométrie(s) invalide(s) dans communes.`);
    }

    console.log('\n--- Diagnostic terminé avec succès ---');
  } catch (err) {
    console.error('\n[ERREUR FATALE]', err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await db.pool.end();
  }
}

main();
