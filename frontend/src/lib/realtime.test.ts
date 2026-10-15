import { describe, expect, it } from 'vitest';
import { invalidationKeysForEvent, parseSseFrames } from './realtime';

describe('parseSseFrames', () => {
  it('extrait une frame complète event + data', () => {
    const { frames, rest } = parseSseFrames('event: alert.created\ndata: {"a":1}\n\n');
    expect(frames).toEqual([{ event: 'alert.created', data: '{"a":1}' }]);
    expect(rest).toBe('');
  });

  it('extrait plusieurs frames d’un même chunk', () => {
    const { frames, rest } = parseSseFrames(
      'event: alert.updated\ndata: {"n":1}\n\nevent: detection.run\ndata: {"s":"SUCCESS"}\n\n',
    );
    expect(frames).toHaveLength(2);
    expect(frames[0].event).toBe('alert.updated');
    expect(frames[1].event).toBe('detection.run');
    expect(rest).toBe('');
  });

  it('ignore les commentaires de ping et les frames sans data', () => {
    const { frames, rest } = parseSseFrames(': ping\n\nevent: alert.created\ndata: {}\n\n');
    expect(frames).toEqual([{ event: 'alert.created', data: '{}' }]);
    expect(rest).toBe('');
  });

  it('conserve le reste incomplet pour le prochain chunk', () => {
    const { frames, rest } = parseSseFrames('event: alert.created\ndata: {"partial"');
    expect(frames).toEqual([]);
    expect(rest).toBe('event: alert.created\ndata: {"partial"');
  });

  it('retombe sur event "message" sans ligne event:', () => {
    const { frames } = parseSseFrames('data: hello\n\n');
    expect(frames).toEqual([{ event: 'message', data: 'hello' }]);
  });

  it('reconstitue les data sur plusieurs lignes', () => {
    const { frames } = parseSseFrames('data: ligne1\ndata: ligne2\n\n');
    expect(frames).toEqual([{ event: 'message', data: 'ligne1\nligne2' }]);
  });
});

describe('invalidationKeysForEvent', () => {
  it('invalide le fil d’alertes pour tout événement alert.*', () => {
    expect(invalidationKeysForEvent('alert.created')).toEqual([['alerts']]);
    expect(invalidationKeysForEvent('alert.updated')).toEqual([['alerts']]);
    expect(invalidationKeysForEvent('alert.archived')).toEqual([['alerts']]);
  });

  it('invalide événements et tableau de bord pour une détection', () => {
    expect(invalidationKeysForEvent('detection.run')).toEqual([
      ['events'],
      ['dashboard'],
    ]);
  });

  it('rafraîchit trajectoire, coloration et élus pour un cycle cyclone', () => {
    const keys = invalidationKeysForEvent('cyclone.sync');
    // `event` (préfixe) couvre track, track-points, commune-alerts, exposure.
    expect(keys).toContainEqual(['events']);
    expect(keys).toContainEqual(['event']);
    expect(keys).toContainEqual(['dashboard']);
    expect(keys).toContainEqual(['alerts']);
    expect(keys).toContainEqual(['active-event']);
  });

  it('n’invalide rien pour un type inconnu', () => {
    expect(invalidationKeysForEvent('inconnu')).toEqual([]);
  });
});
