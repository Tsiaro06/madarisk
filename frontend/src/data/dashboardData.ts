/* ---------------------------------------------------------------------------
 * DONNÉES FICTIVES du tableau de bord — MadaRisk Map.
 *
 * Ce fichier centralise TOUTES les valeurs affichées par la page /dashboard :
 * aucun composant ne contient de valeur en dur. Pour brancher votre vraie API,
 * remplacez chaque bloc par l'appel du client correspondant et normalisez la
 * réponse vers les interfaces ci-dessous. Ne changez RIEN dans les composants :
 * ils ne lisent que les types exportés ici.
 *
 *   - brand / tabs     ← statique (nom de l'app, navigation de la topbar)
 *   - kpis             ← dashboardApi.summary()
 *   - miniStats        ← dashboardApi.summary() (sous-comptes)
 *   - coverage         ← dashboardApi.summary() (communes à jour / total)
 *   - bigTotal         ← alertsApi.statistics() ou summary().treatedAlerts
 *   - timeline         ← dashboardApi.eventsTimeline()
 *   - riskDistribution ← dashboardApi.riskDistribution()
 *   - performance      ← dashboardApi.summary() (synchronisation météo)
 * ------------------------------------------------------------------------- */

export interface KpiItem {
  id: string;
  label: string;
  value: string;
  unit?: string;
  /** Variation en % (positif = hausse). */
  delta: number | null;
  /** `true` quand une hausse de la valeur est une bonne nouvelle. */
  positiveIsGood: boolean;
  /** Met la carte en avant : halo bleu et pastille « highlight » citron. */
  highlight?: boolean;
}

export interface MiniStat {
  id: string;
  label: string;
  value: string;
  dotClass: string;
}

export interface CoverageInfo {
  percent: number;
  current: number;
  total: number;
  detailLabel: string;
}

export interface TimelineDatum {
  label: string;
  value: number;
  /** Barre mise en avant (plus sombre + infobulle au-dessus). */
  highlight: boolean;
}

export interface RiskSlice {
  id: string;
  label: string;
  count: number;
  /** Part des communes, en % (somme = 100). */
  share: number;
  color: string;
}

export interface TabItem {
  id: string;
  label: string;
  /** Route react-router associée ; le sans-`/` sert d'onglet inactif. */
  to: string;
}

export interface DashboardData {
  brand: { name: string; slogan: string };
  tabs: TabItem[];
  lastUpdateLabel: string;
  coverage: CoverageInfo;
  miniStats: MiniStat[];
  bigTotal: { value: number; label: string; ctaLabel: string; linkTo: string };
  kpis: KpiItem[];
  timeline: {
    title: string;
    description: string;
    total: number;
    totalUnit: string;
    totalDelta: number;
    positiveIsGood: boolean;
    items: TimelineDatum[];
  };
  riskDistribution: {
    title: string;
    description: string;
    items: RiskSlice[];
  };
  performance: {
    title: string;
    description: string;
    percent: number;
    legend: { label: string; value: string; dotClass: string }[];
    comparisonLabel: string;
    comparisonDelta: string;
  };
}

export const dashboardData: DashboardData = {
  brand: {
    name: 'MadaRisk Map',
    slogan: 'Veille des risques · Madagascar',
  },

  tabs: [
    { id: 'overview', label: 'Vue d’ensemble', to: '/dashboard' },
    { id: 'analytics', label: 'Analytique', to: '/rapports' },
    { id: 'reports', label: 'Rapports', to: '/rapports' },
    { id: 'insights', label: 'Insights', to: '/risques' },
  ],

  lastUpdateLabel: 'Actualisé il y a 12 min',

  coverage: {
    percent: 72,
    current: 1342,
    total: 1695,
    detailLabel: 'communes à jour',
  },

  miniStats: [
    {
      id: 'stations',
      label: 'Stations météo actives',
      value: '1 208',
      dotClass: 'bg-dash-lime',
    },
    {
      id: 'risk',
      label: 'Communes à risque élevé / extrême',
      value: '316',
      dotClass: 'bg-white/80',
    },
    {
      id: 'districts',
      label: 'Districts couverts',
      value: '84 / 112',
      dotClass: 'bg-dash-light',
    },
  ],

  bigTotal: {
    value: 1108,
    label: 'Alertes traitées ce mois',
    ctaLabel: 'Voir les alertes',
    linkTo: '/alertes',
  },

  kpis: [
    {
      id: 'events',
      label: 'Événements suivis',
      value: '14',
      unit: 'actifs',
      delta: 12,
      positiveIsGood: true,
    },
    {
      id: 'alerts',
      label: 'Alertes en cours',
      value: '23',
      unit: 'publiées',
      delta: 8,
      positiveIsGood: false,
      highlight: true,
    },
    {
      id: 'response',
      label: 'Temps de réponse moyen',
      value: '4,2',
      unit: 'min',
      delta: -9,
      positiveIsGood: true,
    },
    {
      id: 'exposed',
      label: 'Population exposée',
      value: '486 210',
      unit: 'hab.',
      delta: -14,
      positiveIsGood: true,
    },
  ],

  timeline: {
    title: 'Évolution des événements',
    description: 'Détections hebdomadaires — 8 dernières semaines',
    total: 153,
    totalUnit: 'événements',
    totalDelta: 18,
    positiveIsGood: true,
    items: [
      { label: 'S1', value: 12, highlight: false },
      { label: 'S2', value: 18, highlight: false },
      { label: 'S3', value: 15, highlight: false },
      { label: 'S4', value: 9, highlight: false },
      { label: 'S5', value: 22, highlight: false },
      { label: 'S6', value: 26, highlight: false },
      { label: 'S7', value: 20, highlight: false },
      { label: 'S8', value: 31, highlight: true },
    ],
  },

  riskDistribution: {
    title: 'Répartition du risque par commune',
    description: 'Sur 1 695 communes évaluées',
    items: [
      { id: 'SANS_RISQUE', label: 'Sans risque', count: 902, share: 53, color: '#cbd5e1' },
      { id: 'FAIBLE', label: 'Risque faible', count: 477, share: 28, color: '#93b4f8' },
      { id: 'MODERE', label: 'Risque modéré', count: 224, share: 13, color: '#5b82f5' },
      { id: 'ELEVE', label: 'Risque élevé', count: 61, share: 4, color: '#2f5bea' },
      { id: 'EXTREME', label: 'Risque extrême', count: 31, share: 2, color: '#a3e635' },
    ],
  },

  performance: {
    title: 'Performance opérationnelle',
    description: 'Synchronisation des données météo',
    percent: 78,
    legend: [
      { label: 'À jour', value: '1 342', dotClass: 'bg-dash' },
      { label: 'En retard', value: '353', dotClass: 'bg-dash-pale' },
    ],
    comparisonLabel: 'vs semaine dernière',
    comparisonDelta: '+2,4 %',
  },
};
