import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ToastProvider, useToast } from './Toast';

function wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

function useToastHarness() {
  return useToast();
}

describe('ToastProvider', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('affiche le message puis le retire après son délai', () => {
    vi.useFakeTimers();
    const { result } = renderHook(useToastHarness, { wrapper });

    act(() => result.current.toast('Événement créé', 'success'));
    expect(screen.getByRole('status')).toHaveTextContent('Événement créé');

    act(() => {
      vi.advanceTimersByTime(4200);
    });

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('purge ses minuteurs au démontage', () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(useToastHarness, { wrapper });

    act(() => result.current.toast('Bonjour'));
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    // Sans purge, le rappel s'exécuterait après la disparition du provider.
    expect(vi.getTimerCount()).toBe(0);
  });
});
