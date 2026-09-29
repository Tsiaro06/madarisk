import {
  Clipboard,
  CloudSun,
  Clock3,
  FileText,
  Grid3x3,
  Hexagon,
  Layers,
  LayoutDashboard,
  Map,
  Radio,
  UserRound,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { UserRole } from '@/lib/roles';

/** Lien de navigation simple. */
export interface SidebarLink {
  kind: 'link';
  to: string;
  label: string;
  icon: LucideIcon;
  /** `end` évite de considers `/evenements` actif pour `/evenements/:id`. */
  end?: boolean;
  roles?: UserRole[];
  /** Pastille rouge : nombre d'alertes actives. */
  badge?: 'alerts';
  /** Action locale (pas de route) : déconnexion, rafraîchissement… */
  onSelect?: () => void | Promise<void>;
}

/** Item de premier niveau qui déplie un sous-menu. */
export interface SidebarAccordion {
  kind: 'accordion';
  id: string;
  label: string;
  icon: LucideIcon;
  children: SidebarLink[];
  roles?: UserRole[];
}

export type SidebarItem = SidebarLink | SidebarAccordion;

/** Colonne de droite : groupe de liens sous un label de section. */
export interface SidebarSection {
  id: string;
  label: string;
  /** Icône alignée à droite du label de section. */
  icon: LucideIcon;
  items: SidebarLink[];
}

export interface SidebarConfig {
  title: string;
  /** Colonne de gauche, en haut. */
  primary: SidebarItem[];
  /** Colonne de gauche, épinglée en bas. */
  footer: SidebarLink[];
  /** Colonnes de droite. */
  sections: SidebarSection[];
}

/**
 * Menu MadaRisk Map.
 *
 * Tout est piloté par ce tableau : pour ajouter une page, ajouter une entrée
 * ici et la route correspondante dans `src/routes/AppRouter.tsx`. Filtrer par
 * rôle avec `roles: ['SUPER_ADMIN']`.
 */
export const SIDEBAR_CONFIG: SidebarConfig = {
  title: 'MadaRisk',
  primary: [
    { kind: 'link', to: '/', label: 'Carte de crise', icon: Map, end: true },
    { kind: 'link', to: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
    { kind: 'link', to: '/evenements', label: 'Événements', icon: Clock3 },
    { kind: 'link', to: '/meteo', label: 'Météo', icon: CloudSun },
    {
      kind: 'accordion',
      id: 'donnees',
      label: 'Données',
      icon: Layers,
      children: [
        { kind: 'link', to: '/territoires', label: 'Territoires', icon: FileText },
        { kind: 'link', to: '/risques', label: 'Niveaux de risque', icon: Grid3x3 },
      ],
    },
  ],
  footer: [
    {
      kind: 'link',
      to: '/administration',
      label: 'Administration',
      icon: Hexagon,
      roles: ['SUPER_ADMIN'],
    },
  ],
  sections: [
    {
      id: 'surveillance',
      label: 'Surveillance',
      icon: Radio,
      items: [
        {
          kind: 'link',
          to: '/alertes',
          label: 'Alertes actives',
          icon: Clipboard,
          badge: 'alerts',
        },
      ],
    },
    {
      id: 'compte',
      label: 'Compte',
      icon: Users,
      items: [
        { kind: 'link', to: '/profil', label: 'Mon profil', icon: UserRound },
      ],
    },
  ],
};
