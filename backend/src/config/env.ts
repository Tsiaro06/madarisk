import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

/**
 * Charge toujours madarisk/backend/.env (indépendamment du cwd).
 */
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config(); // fallback éventuel .env local / variables déjà exportées

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),

  DATABASE_URL: z.string().optional(),

  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().default('mada_risk'),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default('postgres'),
  DB_SSL: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  BCRYPT_SALT_ROUNDS: z.coerce.number().default(12),

  // Liste d' origines autorisées, séparées par des virgules : en production le
  // SPA est servi par l'API elle-même (port 5000), tandis qu'en développement
  // Vite répond sur 5173. Les deux doivent être acceptés.
  FRONTEND_URL: z.string().default('http://localhost:5173,http://localhost:5000'),

  OPEN_METEO_BASE_URL: z.string().default('https://api.open-meteo.com'),
  OPEN_METEO_TIMEOUT_MS: z.coerce.number().default(10000),
  // Jours de reanalyse demandes dans le meme appel que les observations, pour
  // alimenter la courbe horaire passee. 0 = uniquement l'heure courante et la
  // prevision. Ne pas augmenter sans verifier le quota : Open-Meteo pondere le
  // cout d'un appel par le nombre de jours x variables.
  OPEN_METEO_PAST_DAYS: z.coerce.number().int().min(0).max(7).default(1),

  // Plafond d'appels Open-Meteo que l'API s'autorise par jour UTC.
  //
  // L'offre gratuite est un plafond DUR de 10 000 appels, et une cle API ne
  // l'augmente pas : le depassement se paie en 429 jusqu'au reset de 00:00 UTC,
  // c'est-a-dire jusqu'a la perte de toutes les donnees meteo de la journee. Une
  // marge de 1000 sur 10 000 laisse la place a une relance manuelle d'urgence.
  OPEN_METEO_DAILY_BUDGET: z.coerce.number().int().min(1000).max(10000).default(9000),

  DGM_MAPROOM_BASE_URL: z.string().default('https://map.meteomadagascar.mg'),
  DGM_MAPROOM_TIMEOUT_MS: z.coerce.number().default(20000),
  DGM_MAPROOM_INGEST_CRON: z.string().default('0 6 * * *'),
  DGM_MAPROOM_MAX_DISTANCE_DEG: z.coerce.number().default(0.1),

  // ── Veille cyclone temps réel ─────────────────────────────────────────────
  // Détection/veille GDACS + trajectoire et rayons de vent documentés IBTrACS
  // (agence RSMC La Réunion, IBTrACS v04r01 — la source exacte de Batsirai 2022).
  //
  // Le cycle est lent : les agences publient toutes les 6 h et le fichier IBTrACS
  // ACTIVE pèse ~300 Ko. Une passe toutes les 3 h suffit et laisse la place aux
  // relances manuelles.
  CYCLONE_SYNC_CRON: z.string().default('15 */3 * * *'),
  CYCLONE_GDACS_BASE_URL: z.string().default('https://www.gdacs.org'),
  CYCLONE_IBTRACS_URL: z
    .string()
    .default(
      'https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/ibtracs.ACTIVE.list.v04r01.csv',
    ),
  CYCLONE_TIMEOUT_MS: z.coerce.number().default(30000),
  // Zone de veille : « minLon,minLat,maxLon,maxLat » (degrés décimaux). Bassin
  // sud-ouest de l'océan Indien : Madagascar et ses marges. Un cyclone n'est
  // ingéré que si au moins un point de sa trajectoire entre dans ce rectangle.
  CYCLONE_WATCH_BBOX: z.string().default('30,-40,80,5'),
  // Au-delà de ce délai depuis le dernier point observé, un système n'est plus
  // « ACTIF » mais « SUIVI ».
  CYCLONE_ACTIVE_WINDOW_HOURS: z.coerce.number().min(1).default(24),
  // Sortie de veille : un cyclone encore ouvert (ACTIF/SUIVI) dont AUCUNE source
  // ne l'a revu depuis ce délai est clôturé automatiquement. Doit rester
  // supérieur à la cadence du cycle (3 h) pour tolérer un cycle manqué ; 24 h
  // laisse passer une panne d'agence sans clôturer un système bien vivant.
  CYCLONE_STALE_WINDOW_HOURS: z.coerce.number().min(1).default(24),
  // Cycle interrompu : un journal `cyclone_sync_runs` resté RUNNING au-delà de
  // ce délai est marqué FAILED au démarrage du cycle suivant (processus tué en
  // plein cycle). Très supérieur à la durée réelle d'un cycle (quelques minutes).
  CYCLONE_STALE_RUN_HOURS: z.coerce.number().min(1).default(6),

  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-3.8-flash'),
  // Replis, séparés par des virgules. Le quota du fournisseur est journalier ET
  // par modèle : un identifiant épuisé ne condamne donc pas les autres. Ces
  // modèles sont essayés dans l'ordre quand le principal ne peut pas servir
  // (quota épuisé, identifiant retiré par l'éditeur). Vide = aucun repli.
  GEMINI_FALLBACK_MODELS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  GEMINI_TIMEOUT_MS: z.coerce.number().default(30000),
  GEMINI_MAX_RETRIES: z.coerce.number().int().min(0).default(2),
  AI_SUPER_ADMIN_VIEW_CONVERSATIONS: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  UPLOAD_DIR: z.string().default('uploads'),
  MAX_FILE_SIZE_MB: z.coerce.number().default(50),

  REPORTS_DIR: z.string().default('uploads/reports'),
  IMPORTS_DIR: z.string().default('uploads/imports'),

  ENABLE_SCHEDULED_JOBS: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  // Cadence dictée par le quota, pas par la météo.
  //
  // Open-Meteo ne compte pas les requêtes mais les COORDONNÉES : un run
  // national sur 1579 communes coûte ~1580 appels, et les lots de 400 partent
  // sans discontinuer. Le budget ci-dessous (1 run d'observations + 1 run de
  // prévisions, soit ~3160 appels/jour) laisse ~6800 appels de marge, soit
  // quatre relances complètes en cas de panne.
  //
  // Un seul run d'observations par jour : c'est ce qu'a réclamé l'épuisement du
  // 08/10, où le cron toutes les 6 h + le rattrapage au boot + les relances
  // manuelles ont dépassé le plafond de 10 000 avant midi. Les observations
  // Open-Meteo sont horaires et réanalysées : un point de situation quotidien
  // suffit pour la veille cyclone, et la carte affiche jusqu'à 25 h
  // d'ancienneté — le bandeau de fraîcheur le dit explicitement.
  //
  // 06:00 (heure Madagascar) tombe après le reset du quota à 00:00 UTC
  // (03:00 MG), et loin du cron de prévisions de 12 h 20.
  // 06:00 (heure Madagascar) tombe après le reset du quota à 00:00 UTC
  // (03:00 MG), et loin du cron de prévisions de 12 h 20.
  //
  // Un cron ne se déclenche que si le process tourne à cette minute : un
  // créneau manqué (poste éteint la nuit) est rattrapé au démarrage ou au
  // retour de veille dès que la dernière réussite est antérieure au créneau
  // (`missedScheduledScopes`) — une seule fois par créneau, sinon le seuil de
  // fraîcheur de 25 h passait sous une période de 24 h et laissait des journées
  // entières sans synchronisation. Un contrôle périodique (15 min) reprend
  // aussi un run de 06:00 échoué, sans attendre un redémarrage.
  WEATHER_REFRESH_CRON: z.string().default('0 6 * * *'),
  WEATHER_OBSERVATION_CRON: z.string().default(process.env.WEATHER_REFRESH_CRON ?? '0 6 * * *'),
  // Volontairement décalé de 6 h après le cron d'observations (06 h 00). Les
  // deux à la même minute, les lots partaient en parallèle et Open-Meteo — qui
  // rationne par IP — refusait la requête (`too many concurrent requests`). Le
  // run d'observations pouvant durer 15 min quand il converge, l'écart doit
  // dépasser cette durée.
  //
  // Un seul run quotidien : les prévisions ne changent pas d'une demi-heure à
  // l'autre et un point de situation quotidien suffit pour la veille cyclone.
  // C'est ce qui finance la marge nécessaire aux relances manuelles.
  WEATHER_FORECAST_CRON: z.string().default('20 12 * * *'),
  // Doit dépasser la période du cron d'observations (24 h) sans la trop, sinon le
  // bandeau vire au rouge pendant le cycle normal. 1500 min = 24 h de cycle plus
  // 1 h de marge, donc un run complet peut être manqué avant que le bandeau ne
  // signale la péremption. Retenir deux cycles entiers (2880 min) le laisserait
  // vert pendant 24 h sur une panne.
  WEATHER_OBSERVATION_STALE_MINUTES: z.coerce.number().default(1500),
  // Idem côté prévisions : cycle de 24 h, seuil à 26 h.
  WEATHER_FORECAST_STALE_HOURS: z.coerce.number().default(26),

  // Rétention de `weather_hourly`. Chaque run réécrit une fenêtre glissante
  // (hier en réanalyse, J+2 en prévision) en DO UPDATE, mais les heures qui
  // sortent de la fenêtre ne sont plus réécrites : sans purge elles restent
  // définitivement, soit ~9 500 lignes orphelines par run et ~38 000 par jour
  // (~500 Mo/mois pour 1 579 communes). Sept jours couvrent largement la
  // fenêtre affichée (24 h de passé + 48 h de prévision) et laissent de la
  // marge pour comparer des journées.
  WEATHER_HOURLY_RETENTION_DAYS: z.coerce.number().int().min(2).default(7),
  // Purge quotidienne, volontairement décalée des crons météo (observations à
  // 6 h, prévisions à 12 h 20) et du recalcul de risque (chaque heure) : la
  // suppression porte sur des lignes déjà sorties de toute fenêtre affichée.
  WEATHER_HOURLY_PURGE_CRON: z.string().default('40 3 * * *'),

  RISK_RECALCULATION_CRON: z.string().default('10 * * * *'),

  DETECTION_NORMAL_CYCLES_BEFORE_MONITORING: z.coerce.number().int().min(1).default(3),
  DETECTION_MONITORING_HOURS: z.coerce.number().min(1).default(24),
  DETECTION_DEDUPE_HOURS: z.coerce.number().min(1).default(48),

  EXPOSURE_BUFFER_RADIUS_KM: z.coerce.number().min(1).default(25),
  EXPOSURE_TRAJECTORY_RADIUS_KM: z.coerce.number().min(1).default(50),

  ALERTS_AUTO_PUBLISH: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Variables d'environnement invalides :");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

/** Si DATABASE_URL est défini, aligne DB_HOST / DB_PORT / DB_NAME pour les logs et outils. */
function withUrlOverrides(data: z.infer<typeof envSchema>) {
  if (!data.DATABASE_URL) return data;
  try {
    const url = new URL(data.DATABASE_URL);
    return {
      ...data,
      DB_HOST: url.hostname || data.DB_HOST,
      DB_PORT: url.port ? Number(url.port) : data.DB_PORT,
      DB_NAME: url.pathname.replace(/^\//, '') || data.DB_NAME,
      DB_USER: url.username ? decodeURIComponent(url.username) : data.DB_USER,
      DB_PASSWORD: url.password ? decodeURIComponent(url.password) : data.DB_PASSWORD,
    };
  } catch {
    return data;
  }
}

export const env = withUrlOverrides(parsed.data);
