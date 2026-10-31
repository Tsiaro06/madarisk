import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { extractBulletinArchive, cleanupExtracted } from '../../src/services/event-bulletin-import/extract';
import { detectAndParseFiles } from '../../src/services/event-bulletin-import/detect';

/**
 * Import de bulletins au format RAR.
 *
 * Les archives `.rar` sont autorisées par la liste blanche de l'upload mais
 * n'étaient pas décompressées : le fichier était copié tel quel et l'import
 * échouait sur « Aucun point de trajectoire détecté ». Ces tests figent le
 * support réel (décompression via node-unrar-js) et les messages d'erreur.
 */

const fixturesDir = path.join(__dirname, '..', 'fixtures', 'event-bulletins');
const tempDirs: string[] = [];
const extractDirs: string[] = [];

function stage(fixtureName: string, content?: Buffer): Express.Multer.File {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'madarisk-bulletin-'));
  tempDirs.push(tempDir);
  const stored = path.join(tempDir, fixtureName);
  if (content) {
    fs.writeFileSync(stored, content);
  } else {
    fs.copyFileSync(path.join(fixturesDir, fixtureName), stored);
  }
  return { originalname: fixtureName, filename: fixtureName, path: stored } as Express.Multer.File;
}

async function extract(file: Express.Multer.File) {
  const result = await extractBulletinArchive(file);
  extractDirs.push(result.extractDir);
  return result;
}

afterEach(() => {
  for (const dir of extractDirs.splice(0)) cleanupExtracted(dir);
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('extractBulletinArchive — archives RAR', () => {
  it('extrait le CSV contenu dans une archive RAR et le détecte', async () => {
    const { files } = await extract(stage('cyclone-track.rar'));

    expect(files).toHaveLength(1);
    expect(path.extname(files[0])).toBe('.csv');

    const detected = await detectAndParseFiles(files);
    expect(detected.parser).toBe('GENERIC_CSV');
    expect(detected.points).toHaveLength(3);
    expect(detected.points[0]).toMatchObject({ lat: -15.2, lon: 52.1, pressureHpa: 975 });
    // 85 nœuds -> km/h, comme les autres parseurs.
    expect(detected.points[0].windSpeedKmh).toBeCloseTo(157.42, 1);
  });

  it('refuse une archive RAR protégée par mot de passe avec un message explicite', async () => {
    await expect(extract(stage('encrypted.rar'))).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/mot de passe/i),
    });
  });

  it('refuse une archive RAR illisible sans masquer la cause', async () => {
    await expect(extract(stage('corrupt.rar', Buffer.from('not a rar archive')))).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/extraire l'archive/i),
    });
  });

  it('refuse les archives .7z avec un message explicite', async () => {
    await expect(extract(stage('archive.7z', Buffer.from('7z payload')))).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/\.7z .*convertiss/i),
    });
  });
});
