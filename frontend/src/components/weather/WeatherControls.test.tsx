import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WeatherControls } from './WeatherControls';

/**
 * Le bandeau « la carte n'affiche pas la météo d'aujourd'hui » doit apparaître
 * quand la couche « aujourd'hui » sert en réalité une journée antérieure — sans
 * cela, une carte colorée semble normale alors qu'elle est en retard d'un jour.
 */
function renderControls(overrides: Partial<Parameters<typeof WeatherControls>[0]> = {}) {
  const today = new Date();
  const todayISOStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;

  return render(
    <WeatherControls
      metric="precipitation"
      date={todayISOStr}
      hour={null}
      mode="OBSERVATION"
      districtId=""
      districts={[]}
      maxDate={todayISOStr}
      lastDataAt={null}
      lastSyncAt={null}
      lastSyncStatus={null}
      dataDay={todayISOStr}
      canRefresh
      onMetricChange={vi.fn()}
      onDateChange={vi.fn()}
      onHourChange={vi.fn()}
      onDistrictChange={vi.fn()}
      isRefreshing={false}
      refreshProgress={null}
      onRefresh={vi.fn()}
      {...overrides}
    />,
  );
}

describe('WeatherControls — fraîcheur de la couche « aujourd’hui »', () => {
  it('n’alerte pas quand la donnée du jour est présente', () => {
    renderControls();

    expect(
      screen.queryByText(/La carte n’affiche pas encore la météo d’aujourd’hui/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Jour affiché/i)).toBeInTheDocument();
  });

  it('alerte quand « aujourd’hui » sert une journée antérieure', () => {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 3600_000);
    const yesterdayISO = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(
      yesterday.getDate(),
    ).padStart(2, '0')}`;

    renderControls({ dataDay: yesterdayISO });

    expect(
      screen.getByText(/La carte n’affiche pas encore la météo d’aujourd’hui/i),
    ).toBeInTheDocument();
  });

  it('invite à relancer la synchronisation seulement si l’utilisateur en a le droit', () => {
    const today = new Date();
    const yesterdayISO = new Date(today.getTime() - 24 * 3600_000)
      .toISOString()
      .slice(0, 10);

    const { unmount } = renderControls({ dataDay: yesterdayISO, canRefresh: true });
    expect(screen.getByText(/relancez-la ci-dessous/i)).toBeInTheDocument();
    unmount();

    renderControls({ dataDay: yesterdayISO, canRefresh: false });
    expect(screen.queryByText(/relancez-la ci-dessous/i)).not.toBeInTheDocument();
  });
});
