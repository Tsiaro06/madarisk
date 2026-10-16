import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AiAnswerMeta } from './AiAnswerMeta';
import { formatDate } from '@/lib/utils';

const TIMESTAMP = '2026-10-14T03:07:26.214Z';

/**
 * Les métadonnées d'une réponse (sources, date, limites) étaient reçues par le
 * flux mais jamais affichées : l'utilisateur devait croire l'assistant sur
 * parole. Elles sont désormais lisibles sous la réponse.
 */
describe('AiAnswerMeta', () => {
  it('affiche les sources traduites, la date des données et les limites', () => {
    render(
      <AiAnswerMeta
        meta={{
          conversationId: 'conv-1',
          internalSources: ['getCommuneLatestRisk', 'getLatestWeather'],
          dataTimestamp: TIMESTAMP,
          limitations: ['Aucune donnée météo pour cette commune.'],
        }}
      />,
    );

    expect(screen.getByText('Données consultées :')).toBeInTheDocument();
    expect(
      screen.getByText(/dernier niveau de risque, dernières observations météo/),
    ).toBeInTheDocument();
    expect(screen.getByText('Date des données :')).toBeInTheDocument();
    expect(screen.getByText(formatDate(TIMESTAMP))).toBeInTheDocument();
    expect(screen.getByText('Aucune donnée météo pour cette commune.')).toBeInTheDocument();
  });

  it('annonce explicitement l’absence de source et de date', () => {
    render(
      <AiAnswerMeta
        meta={{
          conversationId: 'conv-1',
          internalSources: [],
          dataTimestamp: null,
          limitations: [],
        }}
      />,
    );

    expect(screen.getByText('aucune')).toBeInTheDocument();
    expect(screen.getByText('inconnue')).toBeInTheDocument();
  });
});
