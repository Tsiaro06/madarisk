import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiClientError } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import type { SanitizedUser } from '@/types';

export interface LoginValues {
  email: string;
  password: string;
}

export interface InstallSuperAdminValues {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface LoginFailure {
  /** Message prêt à afficher, en français. */
  message: string;
  status: number;
  /** Erreurs renvoyées par l'API (`422`), à reporter sur les champs. */
  fieldErrors: Partial<Record<keyof LoginValues, string>>;
}

const NO_FIELD_ERRORS: Partial<Record<keyof LoginValues, string>> = {};
const DEFAULT_RETRY_AFTER = 60;

function pickFieldErrors(errors: ApiClientError['errors']): Partial<Record<keyof LoginValues, string>> {
  if (!errors?.length) return NO_FIELD_ERRORS;
  const picked: Partial<Record<keyof LoginValues, string>> = {};
  for (const entry of errors) {
    if (entry.field === 'email' || entry.field === 'password') {
      picked[entry.field] = entry.message;
    }
  }
  return picked;
}

/**
 * Traduit une erreur `ApiClientError` en message français exploitable.
 *
 * Le seul point d'appel réseau du formulaire de connexion est
 * `useAuthStore.login` (`POST /auth/login`) : aucune authentification n'est
 * simulée côté front.
 */
function normalizeLoginError(error: unknown): { failure: LoginFailure; retryAfter: number } {
  if (!(error instanceof ApiClientError)) {
    return {
      failure: {
        message: 'Connexion impossible. Réessayez dans quelques instants.',
        status: 0,
        fieldErrors: NO_FIELD_ERRORS,
      },
      retryAfter: 0,
    };
  }

  const fieldErrors = pickFieldErrors(error.errors);

  if (error.status === 429) {
    const seconds = error.retryAfter && error.retryAfter > 0 ? error.retryAfter : DEFAULT_RETRY_AFTER;
    return {
      failure: {
        message:
          'Trop de tentatives de connexion. La demande est bloquée pour votre sécurité, réessayez dans un instant.',
        status: error.status,
        fieldErrors,
      },
      retryAfter: seconds,
    };
  }

  if (error.status === 403) {
    return {
      failure: {
        message: 'Ce compte est désactivé. Contactez l’administrateur de la plateforme.',
        status: error.status,
        fieldErrors,
      },
      retryAfter: 0,
    };
  }

  if (error.status === 0) {
    return {
      failure: {
        message: 'Serveur injoignable. Vérifiez votre connexion réseau puis réessayez.',
        status: error.status,
        fieldErrors,
      },
      retryAfter: 0,
    };
  }

  return {
    failure: {
      message: error.message || 'Identifiants invalides. Vérifiez votre e-mail et votre mot de passe.',
      status: error.status,
      fieldErrors,
    },
    retryAfter: 0,
  };
}

/**
 * Logique d'authentification de la page de connexion, séparée de la
 * présentation : appel à l'API, normalisation des erreurs et décompte du
 * `Retry-After` en cas de `429`.
 */
export function useLogin(onSuccess: (user: SanitizedUser) => void) {
  const login = useAuthStore((state) => state.login);
  const [failure, setFailure] = useState<LoginFailure | null>(null);
  const [retryAfter, setRetryAfter] = useState(0);

  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = window.setInterval(() => setRetryAfter((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [retryAfter]);

  const mutation = useMutation({
    mutationFn: (values: LoginValues) => login(values.email.trim(), values.password),
    onSuccess: () => {
      setFailure(null);
      setRetryAfter(0);
      const authenticated = useAuthStore.getState().user;
      if (authenticated) onSuccess(authenticated);
    },
    onError: (error) => {
      const normalized = normalizeLoginError(error);
      setFailure(normalized.failure);
      setRetryAfter(normalized.retryAfter);
    },
  });

  const submit = (values: LoginValues) => {
    if (retryAfter > 0 || mutation.isPending) return;
    setFailure(null);
    mutation.mutate(values);
  };

  return {
    submit,
    isPending: mutation.isPending,
    failure,
    fieldErrors: failure?.fieldErrors ?? NO_FIELD_ERRORS,
    retryAfter,
    clearFailure: () => setFailure(null),
  };
}

/**
 * Installation initiale : `POST /auth/register` n'accepte que la création du
 * tout premier compte (SUPER_ADMIN) et renvoie `403` dès qu'un utilisateur
 * existe. L'action reste donc accessible mais rarement utilisée.
 */
export function useInstallSuperAdmin(onSuccess: () => void) {
  const register = useAuthStore((state) => state.register);
  const [failure, setFailure] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (values: InstallSuperAdminValues) => register({
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      email: values.email.trim(),
      password: values.password,
    }),
    onSuccess: () => {
      setFailure(null);
      onSuccess();
    },
    onError: (error) => {
      setFailure(
        error instanceof ApiClientError
          ? error.message
          : 'Création du compte impossible. Réessayez dans quelques instants.',
      );
    },
  });

  return {
    submit: (values: InstallSuperAdminValues) => {
      setFailure(null);
      mutation.mutate(values);
    },
    isPending: mutation.isPending,
    failure,
    clearFailure: () => setFailure(null),
  };
}
