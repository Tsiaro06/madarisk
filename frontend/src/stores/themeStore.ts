import { create } from 'zustand';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'madarisk_theme';
/** Ancien claveau local à la sidebar, repris pour ne pas perdre le choix. */
const LEGACY_THEME_KEY = 'madarisk_sidebar_theme';

function readInitial(): Theme {
  if (typeof window === 'undefined') return 'light';
  for (const key of [THEME_KEY, LEGACY_THEME_KEY]) {
    const stored = localStorage.getItem(key);
    if (stored === 'light' || stored === 'dark') return stored;
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** La classe `dark` sur <html> pilote les variantes `dark:` de toute l'app. */
function apply(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const initial = readInitial();
  // Appliqué à la création du store : aucun flash de thème clair au démarrage.
  apply(initial);

  return {
    theme: initial,
    setTheme: (theme) => {
      if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_KEY, theme);
      apply(theme);
      set({ theme });
    },
    toggle: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
  };
});
