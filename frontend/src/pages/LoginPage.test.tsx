import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/Toast';
import { ApiClientError } from '@/api/client';
import { LoginPage } from './LoginPage';
import type { SanitizedUser } from '@/types';

const fakeUser: SanitizedUser = {
  id: '00000000-0000-0000-0000-000000000001',
  organizationId: null,
  firstName: 'Admin',
  lastName: 'MadaRisk',
  email: 'admin@madarisk.mg',
  role: 'SUPER_ADMIN',
  isActive: true,
  lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const authState = vi.hoisted(() => ({
  user: null as SanitizedUser | null,
  login: vi.fn(),
  register: vi.fn(),
}));

vi.mock('@/stores/authStore', () => {
  const useAuthStore = (selector?: (state: typeof authState) => unknown): unknown => {
    if (typeof selector === 'function') return selector(authState);
    return authState;
  };
  useAuthStore.getState = () => authState;
  return { useAuthStore };
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<p>Accueil carte de crise</p>} />
          </Routes>
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authState.user = null;
  authState.login.mockReset();
  authState.register.mockReset();
  window.localStorage.clear();
});

describe('LoginPage — écran partagé', () => {
  it('affiche le panneau de présentation et le formulaire', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /Anticiper les risques\.\s*Protéger les territoires\./ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Bienvenue sur MadaRisk' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Adresse e-mail')).toBeInTheDocument();
    expect(screen.getByLabelText('Mot de passe')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Se connecter/ })).toBeInTheDocument();
  });

  it('masque le mot de passe par défaut et le révèle à la demande', async () => {
    const user = userEvent.setup();
    renderPage();
    const password = screen.getByLabelText('Mot de passe');
    expect(password).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: /Afficher le mot de passe/ }));
    expect(password).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: /Masquer le mot de passe/ }));
    expect(password).toHaveAttribute('type', 'password');
  });

  it('bloque l’envoi et signale les champs requis', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /Se connecter/ }));

    expect(await screen.findByText("L'adresse e-mail est requise")).toBeInTheDocument();
    expect(screen.getByText('Le mot de passe est requis')).toBeInTheDocument();
    expect(authState.login).not.toHaveBeenCalled();
  });

  it('signale une adresse e-mail invalide et n’appelle pas l’API', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Adresse e-mail'), 'pas-un-email');
    await user.type(screen.getByLabelText('Mot de passe'), 'motdepasse');
    await user.click(screen.getByRole('button', { name: /Se connecter/ }));

    expect(await screen.findByText('Adresse e-mail invalide')).toBeInTheDocument();
    expect(authState.login).not.toHaveBeenCalled();
  });

  it('affiche le message du serveur en cas d’identifiants invalides', async () => {
    const user = userEvent.setup();
    authState.login.mockRejectedValue(
      new ApiClientError('Email ou mot de passe incorrect', 401),
    );
    renderPage();

    await user.type(screen.getByLabelText('Adresse e-mail'), 'admin@madarisk.mg');
    await user.type(screen.getByLabelText('Mot de passe'), 'Mauvais@123');
    await user.click(screen.getByRole('button', { name: /Se connecter/ }));

    expect(await screen.findByText('Connexion impossible')).toBeInTheDocument();
    expect(
      screen.getByText('Email ou mot de passe incorrect'),
    ).toBeInTheDocument();
  });

  it('connecte l’utilisateur puis le redirige vers l’accueil', async () => {
    const user = userEvent.setup();
    authState.login.mockImplementation(async () => {
      authState.user = fakeUser;
    });
    renderPage();

    await user.type(screen.getByLabelText('Adresse e-mail'), 'admin@madarisk.mg');
    await user.type(screen.getByLabelText('Mot de passe'), 'Admin@123!');
    await user.click(screen.getByRole('button', { name: /Se connecter/ }));

    await waitFor(() => expect(authState.login).toHaveBeenCalledOnce());
    expect(await screen.findByText('Accueil carte de crise')).toBeInTheDocument();
  });

  it('bascule vers le mode « installation initiale »', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole('button', { name: /Installation initiale — créer le premier compte/ }),
    );

    expect(
      screen.getByRole('heading', { name: 'Créer le premier compte' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Retour à la connexion/ }));
    expect(
      screen.getByRole('heading', { name: 'Bienvenue sur MadaRisk' }),
    ).toBeInTheDocument();
  });
});