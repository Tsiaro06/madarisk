// Bulletins cycloniques officiels de la Direction Générale de la Météorologie
// (DGM — Météo Madagascar) concernant le cyclone GEZANI, février 2026.
//
// Source unique : recueil officiel « Bulletin DGM GEZANI » (23 bulletins
// spéciaux + 6 bulletins flash « Vaovao Tselatra »), publié en malgache et en
// français. Chaque bulletin est reproduit ici avec son numéro officiel, son
// heure de publication (heure de Madagascar, UTC+03:00), son heure
// d'observation, ses intensités, sa position publiée et la répartition des
// alertes qu'il annonce. Rien n'est inventé : les valeurs absentes du bulletin
// restent `null`.
//
// Numérotation : la DGM numérote « N° xx/10 » (mois d'octobre du calendrier
// cyclonique). Le recueil commence au N° 04/10 du 8 février 2026 : les bulletins
// N° 01/10 à 03/10 (antérieurs) ne figurent pas dans la source. Deux numéros
// sont réutilisés par la DGM (N° 14/10 pour le 10/02 22h et le 11/02 04h,
// N° 17/10 pour le 11/02 17h30 et le 14/02 11h) : ils sont conservés tels quels.
//
// Conventions de lecture des alertes (code couleur cyclonique malgache) :
//  - « Loza mitatao miloko mena » / « Alerte rouge (danger imminent) » → ROUGE ;
//  - « Loza manambana miloko mavo » / « Alerte jaune (menace) » → JAUNE ;
//  - « Fanairana miloko maintso » / « Alerte verte (avertissement) » → VERT ;
//  - « Fahamailoana miloko manga » / « Alerte bleue (vigilance post-cyclone) »
//    → BLEU ;
//  - « Foana ny filazana loza » / « Alerte levée » → plus aucun niveau.
// Les régions sont citées en majuscules par la DGM, les districts en
// minuscules : la distinction est celle du bulletin, pas une interprétation.

export type GezaniAlertLevel = 'VERT' | 'JAUNE' | 'ROUGE' | 'BLEU';

export interface GezaniAlertGroup {
  level: GezaniAlertLevel;
  /** Régions citées en majuscules par la DGM (noms officiels, tels quels). */
  regions: string[];
  /** Districts cités par la DGM (orthographe officielle du bulletin). */
  districts: string[];
}

export interface GezaniLifted {
  regions: string[];
  districts: string[];
}

export interface GezaniBulletin {
  /** Numéro officiel DGM (« 04/10 », « 01/10 »…). */
  reference: string;
  kind: 'SPECIAL' | 'FLASH';
  /** Publication officielle, heure de Madagascar (UTC+03:00). */
  publishedAt: string;
  /** Heure d'observation du centre, UTC. */
  observedAt: string;
  title: string;
  /** Position publiée par la DGM (texte officiel français). */
  positionDescription: string;
  /** Vent moyen publié (km/h). */
  windKmh: number;
  /** Rafales publiées (km/h). */
  gustKmh: number;
  /** Direction de déplacement publiée, en français. */
  movementDirection: string | null;
  movementSpeedKmh: number | null;
  /** Niveau le plus élevé en vigueur (`null` si toutes les alertes sont levées). */
  alertLevel: GezaniAlertLevel | null;
  /** Niveaux annoncés par ce bulletin, avec les territoires concernés. */
  alerts: GezaniAlertGroup[];
  /** Territoires dont l'alerte est explicitement levée par ce bulletin. */
  lifted: GezaniLifted;
  /** Texte officiel français du bulletin. */
  content: string;
}

/**
 * Noms de districts tels que publiés par la DGM → noms de la table `districts`
 * (noms historiques conservés en base). Aucune autre correspondance n'est
 * appliquée : un district absent de cette table est signalé comme introuvable.
 */
export const GEZANI_DISTRICT_ALIASES: Record<string, string> = {
  'Ampanihy Andrefana': 'Ampanihy Ouest',
  'Antanambao Manampotsy': 'Antanambao Manampontsy',
  'Befandriana Avaratra': 'Befandriana Nord',
};

/** Régions citées par les bulletins (nom officiel DGM → nom en base). */
export const GEZANI_REGION_ALIASES: Record<string, string> = {
  AMBATOSOA: 'Ambatosoa',
  ANALANJIROFO: 'Analanjirofo',
  ATSINANANA: 'Atsinanana',
  'ALAOTRA MANGORO': 'Alaotra Mangoro',
  ANALAMANGA: 'Analamanga',
  BETSIBOKA: 'Betsiboka',
  BONGOLAVA: 'Bongolava',
  ITASY: 'Itasy',
  VAKINANKARATRA: 'Vakinankaratra',
  MELAKY: 'Melaky',
  MENABE: 'Menabe',
};

const NO_LIFT: GezaniLifted = { regions: [], districts: [] };

/**
 * Les bulletins flash (« Vaovao Tselatra ») ne republient PAS la répartition des
 * alertes : ils ne donnent que la position du centre, l'intensité, le
 * déplacement et le lieu/heure d'atterrissage. Ils ne modifient donc aucun
 * niveau — les alertes en vigueur restent celles du bulletin spécial qui les
 * encadre — et leur `alertLevel` vaut `null` : le niveau du moment n'est pas
 * publié par le document, il ne doit donc pas être déduit ici.
 */
const FLASH_ALERTS: GezaniAlertGroup[] = [];

/** Alertes vertes récurrentes (avertissement) du 8 au 10 février 2026. */
const GREEN_BONGOLAVA_GROUP = ['BONGOLAVA', 'ITASY', 'VAKINANKARATRA', 'MELAKY', 'MENABE'];

export const GEZANI_BULLETINS: GezaniBulletin[] = [
  {
    reference: '04/10',
    kind: 'SPECIAL',
    publishedAt: '2026-02-08T10:00:00+03:00',
    observedAt: '2026-02-08T06:00:00Z',
    title:
      'Bulletin cyclonique spécial du 8 février 2026 à 10h00 (observation de 09h00, heure de Madagascar) — N° 04/10',
    positionDescription: "Centre localisé à environ 823 km à l'Est de Toamasina.",
    windKmh: 65,
    gustKmh: 90,
    movementDirection: 'Ouest',
    movementSpeedKmh: 7,
    alertLevel: 'VERT',
    alerts: [
      {
        level: 'VERT',
        regions: ['AMBATOSOA', 'ANALANJIROFO', 'ATSINANANA', 'ALAOTRA MANGORO'],
        districts: ['Antalaha', 'Mandritsara', 'Befandriana Avaratra'],
      },
    ],
    lifted: NO_LIFT,
    content:
      "Bulletin cyclonique spécial du 8 février 2026 à 10 heures locales. La dépression tropicale de l'océan Indien s'est intensifiée en tempête tropicale modérée et a été baptisée GEZANI tôt ce matin. À 09 heures locales, son centre était localisé à environ 823 km à l'Est de Toamasina. Le vent moyen associé est estimé à 65 km/h, avec des rafales de 90 km/h sous orages. Après un mouvement quasi stationnaire durant la nuit dernière, les données indiquent désormais qu'elle entame un cap vers l'Ouest à un rythme de 7 km/h. La dernière prévision indique que GEZANI touchera terre entre Mananara Avaratra et Vatomandry dans l'après-midi ou la nuit de mardi prochain. Au moment de l'impact, la probabilité d'atteindre le stade de cyclone tropical est assez élevée (rafales de l'ordre de 180 km/h). Les populations des régions et districts suivants sont priées d'appliquer les prescriptions d'alerte verte (avertissement) : AMBATOSOA, ANALANJIROFO, ATSINANANA, ALAOTRA MANGORO, Antalaha, Mandritsara et Befandriana Avaratra. Une dégradation des conditions météorologiques en mer devrait se mettre en place dès demain après-midi, avec des houles cycloniques s'amplifiant progressivement à l'avant du système. La sortie en mer est strictement déconseillée entre Vohemar et Mahanoro à compter de demain après-midi.",
  },
  {
    reference: '05/10',
    kind: 'SPECIAL',
    publishedAt: '2026-02-08T16:00:00+03:00',
    observedAt: '2026-02-08T12:00:00Z',
    title:
      'Bulletin cyclonique spécial du 8 février 2026 à 16h00 (observation de 15h00, heure de Madagascar) — N° 05/10',
    positionDescription: "Centre situé à environ 796 km à l'Est de Toamasina.",
    windKmh: 65,
    gustKmh: 90,
    movementDirection: 'Ouest',
    movementSpeedKmh: 5,
    alertLevel: 'JAUNE',
    alerts: [
      {
        level: 'JAUNE',
        regions: ['AMBATOSOA', 'ANALANJIROFO'],
        districts: ['Toamasina I', 'Toamasina II', 'Brickaville', 'Vatomandry'],
      },
      {
        level: 'VERT',
        regions: ['ALAOTRA MANGORO', 'ANALAMANGA', 'BETSIBOKA'],
        districts: [
          'Antalaha',
          'Andapa',
          'Mandritsara',
          'Befandriana Avaratra',
          'Marolambo',
          'Antanambao Manampotsy',
          'Mahanoro',
        ],
      },
    ],
    lifted: NO_LIFT,
    content:
      "Bulletin cyclonique spécial du 8 février 2026 à 16 heures locales. À 15 heures locales, GEZANI était positionnée à environ 796 km à l'Est de Toamasina. Le vent moyen reste estimé à 65 km/h, avec des rafales de 90 km/h sous orages. Elle s'est déplacée lentement vers l'Ouest à un rythme de 5 km/h. Elle évolue actuellement dans un environnement favorable, favorisant ainsi son intensification continue au cours des deux prochains jours. La dernière prévision indique que GEZANI touchera terre entre Mananara Avaratra et Vatomandry dans l'après-midi ou la nuit de mardi prochain. Au moment de l'impact, la probabilité d'atteindre le stade de cyclone tropical est élevée (rafales de l'ordre de 180 km/h). Alertes cycloniques : alerte jaune (menace) pour AMBATOSOA, ANALANJIROFO, Toamasina I-II, Brickaville et Vatomandry ; alerte verte (avertissement) pour ALAOTRA MANGORO, ANALAMANGA, BETSIBOKA, Antalaha, Andapa, Mandritsara, Befandriana Avaratra, Marolambo, Antanambao Manampotsy et Mahanoro. Une dégradation des conditions météorologiques en mer devrait se mettre en place dès demain après-midi. La sortie en mer est strictement déconseillée entre Vohemar et Mahanoro à compter de demain après-midi.",
  },
  {
    reference: '06/10',
    kind: 'SPECIAL',
    publishedAt: '2026-02-08T22:00:00+03:00',
    observedAt: '2026-02-08T18:00:00Z',
    title:
      'Bulletin cyclonique spécial du 8 février 2026 à 22h00 (observation de 21h00, heure de Madagascar) — N° 06/10',
    positionDescription: "Centre situé à environ 723 km à l'Est de Toamasina.",
    windKmh: 65,
    gustKmh: 90,
    movementDirection: 'Ouest-Nord-Ouest',
    movementSpeedKmh: 13,
    alertLevel: 'JAUNE',
    alerts: [
      {
        level: 'JAUNE',
        regions: ['AMBATOSOA', 'ANALANJIROFO'],
        districts: ['Toamasina I', 'Toamasina II', 'Brickaville', 'Vatomandry'],
      },
      {
        level: 'VERT',
        regions: ['ALAOTRA MANGORO', 'ANALAMANGA', 'BETSIBOKA'],
        districts: [
          'Antalaha',
          'Andapa',
          'Mandritsara',
          'Befandriana Avaratra',
          'Marolambo',
          'Antanambao Manampotsy',
          'Mahanoro',
        ],
      },
    ],
    lifted: NO_LIFT,
    content:
      "Bulletin cyclonique spécial du 8 février 2026 à 22 heures locales. À 21 heures locales, GEZANI était positionnée à environ 723 km à l'Est de Toamasina. Le vent moyen reste estimé à 65 km/h, avec des rafales de 90 km/h sous orages. Elle s'est déplacée vers l'Ouest-Nord-Ouest à un rythme de 13 km/h. GEZANI devrait toucher terre entre Mananara Avaratra et Vatomandry dans l'après-midi ou la nuit de mardi prochain. Au moment de l'impact, la probabilité d'atteindre le stade de cyclone tropical est élevée (rafales de l'ordre de 180 km/h). Alertes cycloniques : alerte jaune (menace) pour AMBATOSOA, ANALANJIROFO, Toamasina I-II, Brickaville et Vatomandry ; alerte verte (avertissement) pour ALAOTRA MANGORO, ANALAMANGA, BETSIBOKA, Antalaha, Andapa, Mandritsara, Befandriana Avaratra, Marolambo, Antanambao Manampotsy et Mahanoro. En plus de vents forts, ce système générera de fortes pluies (100 à 150 mm/24h), pouvant causer des inondations généralisées, des crues éclair ainsi que des glissements de terrain. La sortie en mer est strictement déconseillée entre Vohemar et Mahanoro à compter de demain après-midi.",
  },
  {
    reference: '07/10',
    kind: 'SPECIAL',
    publishedAt: '2026-02-09T10:00:00+03:00',
    observedAt: '2026-02-09T06:00:00Z',
    title:
      'Bulletin cyclonique spécial du 9 février 2026 à 10h00 (observation de 09h00, heure de Madagascar) — N° 07/10',
    positionDescription: "Centre situé à environ 580 km à l'Est de Toamasina.",
    windKmh: 75,
    gustKmh: 105,
    movementDirection: 'Ouest',
    movementSpeedKmh: 15,
    alertLevel: 'JAUNE',
    alerts: [
      {
        level: 'JAUNE',
        regions: [
          'AMBATOSOA',
          'ANALANJIROFO',
          'ATSINANANA',
          'ALAOTRA MANGORO',
          'ANALAMANGA',
          'BETSIBOKA',
        ],
        districts: ['Antalaha', 'Andapa', 'Mandritsara', 'Befandriana Avaratra'],
      },
      { level: 'VERT', regions: GREEN_BONGOLAVA_GROUP, districts: [] },
    ],
    lifted: NO_LIFT,
    content:
      "Bulletin cyclonique spécial du 9 février 2026 à 10 heures locales. À 09 heures locales, GEZANI était positionnée à environ 580 km à l'Est de Toamasina. Le vent moyen est estimé à 75 km/h, avec des rafales de 105 km/h. Elle s'est déplacée vers l'Ouest à raison de 15 km/h. GEZANI devrait toucher terre entre Mananara Avaratra et Vatomandry demain après-midi ou la nuit. Au moment de l'impact, la probabilité d'atteindre le stade de cyclone tropical est élevée (rafales de l'ordre de 210 km/h). Alertes cycloniques : alerte jaune (menace) pour AMBATOSOA, ANALANJIROFO, ATSINANANA, ALAOTRA MANGORO, ANALAMANGA, BETSIBOKA, Antalaha, Andapa, Mandritsara et Befandriana Avaratra ; alerte verte (avertissement) pour BONGOLAVA, ITASY, VAKINANKARATRA, MELAKY et MENABE. En plus de vents forts, ce système générera de fortes pluies (100 à 150 mm/24h), pouvant causer des inondations généralisées, des crues éclair ainsi que des glissements de terrain le long de son trajet. La sortie en mer est désormais strictement déconseillée entre Vohemar et Mahanoro.",
  },
  {
    reference: '08/10',
    kind: 'SPECIAL',
    publishedAt: '2026-02-09T16:00:00+03:00',
    observedAt: '2026-02-09T12:00:00Z',
    title:
      'Bulletin cyclonique spécial du 9 février 2026 à 16h00 (observation de 15h00, heure de Madagascar) — N° 08/10',
    positionDescription: "Centre situé à environ 502 km à l'Est de Toamasina.",
    windKmh: 90,
    gustKmh: 125,
    movementDirection: 'Ouest',
    movementSpeedKmh: 15,
    alertLevel: 'JAUNE',
    alerts: [
      {
        level: 'JAUNE',
        regions: [
          'AMBATOSOA',
          'ANALANJIROFO',
          'ATSINANANA',
          'ALAOTRA MANGORO',
          'ANALAMANGA',
          'BETSIBOKA',
        ],
        districts: ['Antalaha', 'Andapa', 'Mandritsara', 'Befandriana Avaratra'],
      },
      { level: 'VERT', regions: GREEN_BONGOLAVA_GROUP, districts: [] },
    ],
    lifted: NO_LIFT,
    content:
      "Bulletin cyclonique spécial du 9 février 2026 à 16 heures locales. À 15 heures locales, GEZANI était positionnée à environ 502 km à l'Est de Toamasina. Elle s'est intensifiée en forte tempête tropicale. Le vent moyen est estimé à 90 km/h, avec des rafales de 125 km/h. Elle s'est déplacée vers l'Ouest à raison de 15 km/h. GEZANI devrait toucher terre entre Brickaville et Fenoarivo Atsinanana demain après-midi ou la nuit. Au moment de l'impact, la probabilité d'atteindre le stade de cyclone tropical intense est désormais évaluée à élevée (rafales de l'ordre de 245 km/h). Alertes cycloniques : alerte jaune (menace) pour AMBATOSOA, ANALANJIROFO, ATSINANANA, ALAOTRA MANGORO, ANALAMANGA, BETSIBOKA, Antalaha, Andapa, Mandritsara et Befandriana Avaratra ; alerte verte (avertissement) pour BONGOLAVA, ITASY, VAKINANKARATRA, MELAKY et MENABE. En plus de vents forts, ce système générera de fortes pluies (100 à 150 mm/24h), pouvant causer des inondations généralisées, des crues éclair ainsi que des glissements de terrain le long de son trajet. La sortie en mer est strictement déconseillée entre Vohemar et Mahanoro.",
  },
  {
    reference: '09/10',
    kind: 'SPECIAL',
    publishedAt: '2026-02-09T22:00:00+03:00',
    observedAt: '2026-02-09T18:00:00Z',
    title:
      'Bulletin cyclonique spécial du 9 février 2026 à 22h00 (observation de 21h00, heure de Madagascar) — N° 09/10',
    positionDescription: "Centre situé à environ 390 km à l'Est de Toamasina.",
    windKmh: 110,
    gustKmh: 155,
    movementDirection: 'Ouest',
    movementSpeedKmh: 18,
    alertLevel: 'JAUNE',
    alerts: [
      {
        level: 'JAUNE',
        regions: [
          'AMBATOSOA',
          'ANALANJIROFO',
          'ATSINANANA',
          'ALAOTRA MANGORO',
          'ANALAMANGA',
          'BETSIBOKA',
        ],
        districts: ['Antalaha', 'Andapa', 'Mandritsara', 'Befandriana Avaratra'],
      },
      { level: 'VERT', regions: GREEN_BONGOLAVA_GROUP, districts: [] },
    ],
    lifted: NO_LIFT,
    content:
      "Bulletin cyclonique spécial du 9 février 2026 à 22 heures locales. À 21 heures locales, la forte tempête tropicale GEZANI était positionnée à environ 390 km à l'Est de Toamasina. Le vent moyen est monté à 110 km/h, avec des rafales de l'ordre de 155 km/h. Elle s'est déplacée vers l'Ouest à raison de 18 km/h. GEZANI devrait toucher terre dans le district de Toamasina II demain après-midi ou la nuit, au stade de cyclone tropical intense (rafales de l'ordre de 245 km/h). Alertes cycloniques : alerte jaune (menace) pour AMBATOSOA, ANALANJIROFO, ATSINANANA, ALAOTRA MANGORO, ANALAMANGA, BETSIBOKA, Antalaha, Andapa, Mandritsara et Befandriana Avaratra ; alerte verte (avertissement) pour BONGOLAVA, ITASY, VAKINANKARATRA, MELAKY et MENABE. En plus de vents forts, ce système générera de fortes pluies (100 à 150 mm/24h), pouvant causer des inondations généralisées, des crues éclair ainsi que des glissements de terrain le long de son trajet. La présence de GEZANI commence à se faire sentir le long du littoral Centre-Est. La sortie en mer est strictement déconseillée entre Vohemar et Mahanoro.",
  },
  {
    reference: '10/10',
    kind: 'SPECIAL',
    publishedAt: '2026-02-10T04:00:00+03:00',
    observedAt: '2026-02-10T00:00:00Z',
    title:
      'Bulletin cyclonique spécial du 10 février 2026 à 04h00 (observation de 03h00, heure de Madagascar) — N° 10/10',
    positionDescription: "Centre situé à environ 290 km à l'Est de Toamasina.",
    windKmh: 150,
    gustKmh: 210,
    movementDirection: 'Ouest',
    movementSpeedKmh: 17,
    alertLevel: 'JAUNE',
    alerts: [
      {
        level: 'JAUNE',
        regions: [
          'AMBATOSOA',
          'ANALANJIROFO',
          'ATSINANANA',
          'ALAOTRA MANGORO',
          'ANALAMANGA',
          'BETSIBOKA',
          'BONGOLAVA',
          'ITASY',
          'VAKINANKARATRA',
        ],
        districts: ['Antalaha', 'Andapa', 'Mandritsara', 'Befandriana Avaratra'],
      },
      { level: 'VERT', regions: ['MELAKY', 'MENABE'], districts: [] },
    ],
    lifted: NO_LIFT,
    content:
      "Bulletin cyclonique spécial du 10 février 2026 à 04 heures locales. À 03 heures locales, GEZANI était positionnée à environ 290 km à l'Est de Toamasina. Elle s'est intensifiée en cyclone tropical. Le vent moyen est monté à 150 km/h, avec des rafales de l'ordre de 210 km/h. Elle s'est déplacée vers l'Ouest à raison de 17 km/h. GEZANI devrait toucher terre dans le district de Toamasina II cet après-midi ou la nuit, au stade de cyclone tropical intense (rafales de l'ordre de 250 km/h). Alertes cycloniques : alerte jaune (menace) pour AMBATOSOA, ANALANJIROFO, ATSINANANA, ALAOTRA MANGORO, ANALAMANGA, BETSIBOKA, BONGOLAVA, ITASY, VAKINANKARATRA, Antalaha, Andapa, Mandritsara et Befandriana Avaratra ; alerte verte (avertissement) pour MELAKY et MENABE. En plus de vents forts, ce système générera de fortes pluies (100 à 150 mm/24h), pouvant causer des inondations généralisées, des crues éclair ainsi que des glissements de terrain le long de son trajet. La sortie en mer est strictement déconseillée entre Vohemar et Mahanoro. Il en est de même pour les pêcheurs entre Besalampy et Morombe à compter de demain matin.",
  },
  {
    reference: '11/10',
    kind: 'SPECIAL',
    publishedAt: '2026-02-10T10:00:00+03:00',
    observedAt: '2026-02-10T06:00:00Z',
    title:
      'Bulletin cyclonique spécial du 10 février 2026 à 10h00 (observation de 09h00, heure de Madagascar) — N° 11/10',
    positionDescription: "Centre situé à environ 186 km à l'Est de Toamasina.",
    windKmh: 160,
    gustKmh: 225,
    movementDirection: 'Ouest',
    movementSpeedKmh: 16,
    alertLevel: 'ROUGE',
    alerts: [
      { level: 'ROUGE', regions: ['ANALANJIROFO', 'ATSINANANA'], districts: [] },
      {
        level: 'JAUNE',
        regions: [
          'AMBATOSOA',
          'ALAOTRA MANGORO',
          'ANALAMANGA',
          'BETSIBOKA',
          'BONGOLAVA',
          'ITASY',
          'VAKINANKARATRA',
          'MELAKY',
          'MENABE',
        ],
        districts: ['Antalaha', 'Andapa', 'Mandritsara', 'Befandriana Avaratra'],
      },
    ],
    lifted: NO_LIFT,
    content:
      "Bulletin cyclonique spécial du 10 février 2026 à 10 heures locales. À 09 heures locales, le cyclone tropical GEZANI était positionné à environ 186 km à l'Est de Toamasina. Le vent moyen est monté à 160 km/h, avec des rafales de l'ordre de 225 km/h. Il s'est déplacé vers l'Ouest à raison de 16 km/h. L'impact direct de GEZANI sur le district de Toamasina II est attendu à compter de 18 heures locales, au stade de cyclone tropical intense (rafales de l'ordre de 250 km/h). Alertes cycloniques : alerte rouge (danger imminent) pour ANALANJIROFO et ATSINANANA ; alerte jaune (menace) pour AMBATOSOA, ALAOTRA MANGORO, ANALAMANGA, BETSIBOKA, BONGOLAVA, ITASY, VAKINANKARATRA, MELAKY, MENABE, Antalaha, Andapa, Mandritsara et Befandriana Avaratra. En plus de vents forts, ce système générera de fortes pluies (100 à 150 mm/24h), pouvant causer des inondations généralisées, des crues éclair ainsi que des glissements de terrain le long de son trajet. L'amas nuageux à l'avant de GEZANI commence à influencer le temps le long du littoral Centre-Est. La sortie en mer est strictement déconseillée entre Vohemar et Mahanoro.",
  },
  {
    reference: '12/10',
    kind: 'SPECIAL',
    publishedAt: '2026-02-10T16:00:00+03:00',
    observedAt: '2026-02-10T12:00:00Z',
    title:
      'Bulletin cyclonique spécial du 10 février 2026 à 16h00 (observation de 15h00, heure de Madagascar) — N° 12/10',
    positionDescription: "Centre situé à environ 89 km à l'Est de Toamasina.",
    windKmh: 185,
    gustKmh: 260,
    movementDirection: 'Ouest',
    movementSpeedKmh: 18,
    alertLevel: 'ROUGE',
    alerts: [
      {
        level: 'ROUGE',
        regions: [
          'ANALANJIROFO',
          'ATSINANANA',
          'ALAOTRA MANGORO',
          'ANALAMANGA',
          'BETSIBOKA',
        ],
        districts: [],
      },
      {
        level: 'JAUNE',
        regions: ['AMBATOSOA', 'BONGOLAVA', 'ITASY', 'VAKINANKARATRA', 'MELAKY', 'MENABE'],
        districts: ['Mandritsara', 'Befandriana Avaratra'],
      },
    ],
    lifted: { regions: [], districts: ['Andapa', 'Antalaha'] },
    content:
      "Bulletin cyclonique spécial du 10 février 2026 à 16 heures locales. À 15 heures locales, GEZANI était positionné à environ 89 km à l'Est de Toamasina. Il est désormais classé au stade de cyclone tropical intense. Le vent moyen est monté à 185 km/h, avec des rafales de l'ordre de 260 km/h près de son centre. Il s'est déplacé vers l'Ouest à raison de 18 km/h. L'atterrissage de GEZANI sur le district de Toamasina II est attendu à compter de 18 heures locales. Le premier mur de l'œil a déjà atteint le littoral d'ATSINANANA et ANALANJIROFO. Les conditions cycloniques ne tarderont pas à se faire sentir avec de fortes pluies. Des inondations généralisées, des crues éclair ainsi que des glissements de terrain sont fortement à craindre. Afin d'éviter le basculement en alerte rouge en pleine nuit, les alertes cycloniques sont mises à jour comme suit : alerte rouge (danger imminent) pour ANALANJIROFO, ATSINANANA, ALAOTRA MANGORO, ANALAMANGA et BETSIBOKA ; alerte jaune (menace) pour AMBATOSOA, BONGOLAVA, ITASY, VAKINANKARATRA, MELAKY, MENABE, Mandritsara et Befandriana Avaratra ; alerte levée pour Andapa et Antalaha. GEZANI traversera les hautes terres centrales d'Est en Ouest durant la nuit prochaine et la journée de mercredi, pour sortir en mer dans le canal de Mozambique, entre Maintirano et Morondava demain soir ou la nuit.",
  },
  {
    reference: '13/10',
    kind: 'SPECIAL',
    publishedAt: '2026-02-10T20:00:00+03:00',
    observedAt: '2026-02-10T16:30:00Z',
    title:
      "Bulletin cyclonique spécial du 10 février 2026 à 20h00 (atterrissage à 19h30, heure de Madagascar) — N° 13/10",
    positionDescription:
      "Le cyclone tropical intense GEZANI a touché terre sur Toamasina vers 19 heures et demie locales.",
    windKmh: 180,
    gustKmh: 250,
    movementDirection: 'Ouest',
    movementSpeedKmh: 16,
    alertLevel: 'ROUGE',
    alerts: [
      {
        level: 'ROUGE',
        regions: [
          'ANALANJIROFO',
          'ATSINANANA',
          'ALAOTRA MANGORO',
          'ANALAMANGA',
          'BETSIBOKA',
        ],
        districts: [],
      },
      {
        level: 'JAUNE',
        regions: ['AMBATOSOA', 'BONGOLAVA', 'ITASY', 'VAKINANKARATRA', 'MELAKY', 'MENABE'],
        districts: ['Mandritsara', 'Befandriana Avaratra'],
      },
    ],
    lifted: { regions: [], districts: ['Andapa', 'Antalaha'] },
    content:
      "Bulletin cyclonique spécial du 10 février 2026 à 20 heures locales. Le cyclone tropical intense GEZANI a touché terre sur Toamasina vers 19 heures et demie locales. Le vent moyen est estimé à 180 km/h, avec des rafales de l'ordre de 250 km/h près de son centre. Il s'est déplacé vers l'Ouest à raison de 16 km/h. Une période d'accalmie d'environ une heure est à prévoir avant la reprise des conditions cycloniques, accompagnées de fortes pluies. Les alertes cycloniques restent inchangées : alerte rouge (danger imminent) pour ANALANJIROFO, ATSINANANA, ALAOTRA MANGORO, ANALAMANGA et BETSIBOKA ; alerte jaune (menace) pour AMBATOSOA, BONGOLAVA, ITASY, VAKINANKARATRA, MELAKY, MENABE, Mandritsara et Befandriana Avaratra ; alerte levée pour Andapa et Antalaha. GEZANI traversera les hautes terres centrales d'Est en Ouest durant la nuit prochaine et la journée de mercredi, pour sortir en mer dans le canal de Mozambique, entre Maintirano et Morondava demain soir ou la nuit.",
  },
  {
    reference: '14/10',
    kind: 'SPECIAL',
    publishedAt: '2026-02-10T22:00:00+03:00',
    observedAt: '2026-02-10T18:00:00Z',
    title:
      'Bulletin cyclonique spécial du 10 février 2026 à 22h00 (observation de 21h00, heure de Madagascar) — N° 14/10',
    positionDescription:
      'Centre positionné dans la commune rurale de Toamasina Suburbaine (district de Toamasina II).',
    windKmh: 170,
    gustKmh: 240,
    movementDirection: 'Ouest',
    movementSpeedKmh: 15,
    alertLevel: 'ROUGE',
    alerts: [
      {
        level: 'ROUGE',
        regions: [
          'ANALANJIROFO',
          'ATSINANANA',
          'ALAOTRA MANGORO',
          'ANALAMANGA',
          'BETSIBOKA',
        ],
        districts: [],
      },
      { level: 'JAUNE', regions: ['BONGOLAVA', 'ITASY', 'VAKINANKARATRA', 'MELAKY', 'MENABE'], districts: [] },
    ],
    lifted: {
      regions: ['AMBATOSOA'],
      districts: ['Mandritsara', 'Befandriana Avaratra'],
    },
    content:
      "Bulletin cyclonique spécial du 10 février 2026 à 22 heures locales. À 21 heures locales, le cyclone tropical intense GEZANI était positionné dans la commune rurale de Toamasina Suburbaine. Le processus d'affaiblissement progressif est en cours. Le vent moyen est estimé à 170 km/h, avec des rafales de l'ordre de 240 km/h près de son centre. Il s'est déplacé vers l'Ouest à raison de 15 km/h. GEZANI traversera les hautes terres centrales d'Est en Ouest durant la nuit prochaine et la journée de mercredi, pour sortir en mer dans le canal de Mozambique, entre Maintirano et Morondava demain soir ou la nuit. Le vent de force ouragan, accompagné de fortes pluies, devrait se poursuivre. Des inondations généralisées, des crues éclair ainsi que des glissements de terrain sont fortement à craindre. Alertes cycloniques : alerte rouge (danger imminent) pour ANALANJIROFO, ATSINANANA, ALAOTRA MANGORO, ANALAMANGA et BETSIBOKA ; alerte jaune (menace) pour BONGOLAVA, ITASY, VAKINANKARATRA, MELAKY et MENABE ; alerte levée pour AMBATOSOA, Mandritsara et Befandriana Avaratra. La version malgache du bulletin (texte de référence) ne place pas Mandritsara ni Befandriana Avaratra en alerte jaune : elle les liste uniquement en « Foana ny filazana loza » (alerte levée).",
  },
  {
    reference: '14/10',
    kind: 'SPECIAL',
    publishedAt: '2026-02-11T04:00:00+03:00',
    observedAt: '2026-02-11T00:00:00Z',
    title:
      'Bulletin cyclonique spécial du 11 février 2026 à 04h00 (observation de 03h00, heure de Madagascar) — N° 14/10',
    positionDescription:
      "Centre positionné dans la commune rurale d'Amboasary Avaratra, district d'Anjozorobe.",
    windKmh: 90,
    gustKmh: 125,
    movementDirection: 'Ouest',
    movementSpeedKmh: 25,
    alertLevel: 'ROUGE',
    alerts: [
      { level: 'ROUGE', regions: ['ALAOTRA MANGORO', 'ANALAMANGA', 'BETSIBOKA'], districts: [] },
      { level: 'BLEU', regions: ['ANALANJIROFO', 'ATSINANANA'], districts: [] },
      { level: 'JAUNE', regions: ['BONGOLAVA', 'ITASY', 'VAKINANKARATRA', 'MELAKY', 'MENABE'], districts: [] },
    ],
    lifted: NO_LIFT,
    content:
      "Bulletin cyclonique spécial du 11 février 2026 à 04 heures locales. À 03 heures locales, GEZANI était positionné dans la commune rurale d'Amboasary Avaratra, district d'Anjozorobe. Elle s'est notablement affaiblie. Au stade de forte tempête tropicale, le vent moyen est estimé à 90 km/h, avec des rafales de l'ordre de 125 km/h près de son centre. Elle s'est déplacée vers l'Ouest à raison de 25 km/h. GEZANI traversera les hautes terres centrales d'Est en Ouest ce jour, pour ensuite sortir en mer dans le canal de Mozambique, entre Maintirano et Morondava en soirée ou la nuit. Le vent de force tempête ou coup de vent, accompagné de fortes pluies, devrait se poursuivre. Des inondations généralisées, des crues éclair ainsi que des glissements de terrain sont fortement à craindre. Alertes cycloniques : alerte rouge (danger imminent) pour ALAOTRA MANGORO, ANALAMANGA et BETSIBOKA ; alerte bleue (vigilance post-cyclone) pour ANALANJIROFO et ATSINANANA ; alerte jaune (menace) pour BONGOLAVA, ITASY, VAKINANKARATRA, MELAKY et MENABE.",
  },
  {
    reference: '15/10',
    kind: 'SPECIAL',
    publishedAt: '2026-02-11T10:00:00+03:00',
    observedAt: '2026-02-11T06:00:00Z',
    title:
      'Bulletin cyclonique spécial du 11 février 2026 à 10h00 (observation de 09h00, heure de Madagascar) — N° 15/10',
    positionDescription:
      'Centre positionné dans la commune rurale de Kiranomnea, district de Fenoarivobe.',
    windKmh: 45,
    gustKmh: 60,
    movementDirection: 'Ouest-Sud-Ouest',
    movementSpeedKmh: 26,
    alertLevel: 'BLEU',
    alerts: [
      {
        level: 'BLEU',
        regions: [
          'ANALANJIROFO',
          'ATSINANANA',
          'ALAOTRA MANGORO',
          'ANALAMANGA',
          'BETSIBOKA',
          'BONGOLAVA',
          'ITASY',
          'VAKINANKARATRA',
          'MELAKY',
          'MENABE',
        ],
        districts: [],
      },
    ],
    lifted: NO_LIFT,
    content:
      "Bulletin cyclonique spécial du 11 février 2026 à 10 heures locales. À 09 heures locales, GEZANI était positionné dans la commune rurale de Kiranomnea, district de Fenoarivobe. Elle s'est notablement affaiblie. Le vent moyen est estimé à 45 km/h, avec des rafales locales de l'ordre de 60 km/h. Elle s'est déplacée vers l'Ouest-Sud-Ouest à raison de 26 km/h. GEZANI devrait sortir en mer entre Maintirano et Morondava en soirée ou la nuit. Du temps globalement venteux et pluvieux persistera durant la journée. Toutefois, le risque de danger potentiel est désormais faible. Alertes cycloniques : alerte bleue (vigilance post-cyclone) pour ANALANJIROFO, ATSINANANA, ALAOTRA MANGORO, ANALAMANGA, BETSIBOKA, BONGOLAVA, ITASY, VAKINANKARATRA, MELAKY et MENABE. La sortie en mer entre Besalampy et Morombe est déconseillée car les conditions météorologiques restent maussades.",
  },
  {
    reference: '16/10',
    kind: 'SPECIAL',
    publishedAt: '2026-02-11T16:00:00+03:00',
    observedAt: '2026-02-11T12:00:00Z',
    title:
      'Bulletin cyclonique spécial du 11 février 2026 à 16h00 (observation de 15h00, heure de Madagascar) — N° 16/10',
    positionDescription: "Centre positionné dans le district d'Antsalova.",
    windKmh: 40,
    gustKmh: 50,
    movementDirection: 'Ouest-Sud-Ouest',
    movementSpeedKmh: 28,
    alertLevel: 'BLEU',
    alerts: [{ level: 'BLEU', regions: ['MELAKY'], districts: [] }],
    lifted: {
      regions: [
        'ANALANJIROFO',
        'ATSINANANA',
        'ALAOTRA MANGORO',
        'ANALAMANGA',
        'BETSIBOKA',
        'BONGOLAVA',
        'ITASY',
        'VAKINANKARATRA',
        'MENABE',
      ],
      districts: [],
    },
    content:
      "Bulletin cyclonique spécial du 11 février 2026 à 16 heures locales. À 15 heures locales, GEZANI était positionné dans le district d'Antsalova. Le vent moyen est estimé à 40 km/h, avec des rafales locales de l'ordre de 50 km/h. Elle s'est déplacée vers l'Ouest-Sud-Ouest à raison de 28 km/h. GEZANI devrait sortir en mer à brève échéance. Des activités pluvio-orageuses associées à ce système influencent principalement la région de MELAKY. La vigilance est de mise face au risque de crues des rivières et aux accumulations des eaux. Alertes cycloniques : alerte bleue (vigilance post-cyclone) pour MELAKY ; alerte levée pour ANALANJIROFO, ATSINANANA, ALAOTRA MANGORO, ANALAMANGA, BETSIBOKA, BONGOLAVA, ITASY, VAKINANKARATRA et MENABE. La sortie en mer entre Besalampy et Morombe est déconseillée car les conditions météorologiques restent maussades.",
  },
  {
    reference: '17/10',
    kind: 'SPECIAL',
    publishedAt: '2026-02-11T17:30:00+03:00',
    observedAt: '2026-02-11T14:00:00Z',
    title:
      'Bulletin cyclonique spécial du 11 février 2026 à 17h30 (sortie en mer vers 17h00, heure de Madagascar) — N° 17/10',
    positionDescription:
      "GEZANI est sortie en mer dans le canal de Mozambique au niveau du district d'Antsalova, vers 17 heures locales.",
    windKmh: 55,
    gustKmh: 75,
    movementDirection: 'Ouest-Sud-Ouest',
    movementSpeedKmh: 24,
    alertLevel: null,
    alerts: [],
    lifted: { regions: ['MELAKY'], districts: [] },
    content:
      "Bulletin cyclonique spécial du 11 février 2026 à 17 heures et demie locales. GEZANI est sortie en mer dans le canal de Mozambique au niveau du district d'Antsalova, vers 17 heures locales. Le vent moyen est estimé à 55 km/h, avec des rafales locales de l'ordre de 75 km/h. Elle s'est déplacée vers l'Ouest-Sud-Ouest à raison de 24 km/h. Désormais, elle s'éloignera davantage des littoraux Centre-Ouest. Des activités pluvio-orageuses associées à ce système influencent temporairement la région de MELAKY. La vigilance est de mise face au risque de crues des rivières et aux accumulations des eaux. Les alertes cycloniques sont levées. La sortie en mer entre Besalampy et Morombe reste déconseillée car les conditions météorologiques sont encore maussades. Météo Madagascar continuera à surveiller en interne l'évolution de ce système. Le bulletin de suivi reprendra dès qu'un changement significatif de la situation est constaté. Ceci est le dernier bulletin concernant GEZANI, sauf changement de la situation.",
  },
  {
    reference: '17/10',
    kind: 'SPECIAL',
    publishedAt: '2026-02-14T11:00:00+03:00',
    observedAt: '2026-02-14T08:00:00Z',
    title:
      'Bulletin cyclonique spécial du 14 février 2026 à 11h00 (observation de 10h00, heure de Madagascar) — N° 17/10',
    positionDescription: "Centre positionné à 898 km à l'Ouest d'Itampolo / Ampanihy.",
    windKmh: 155,
    gustKmh: 210,
    movementDirection: 'Sud',
    movementSpeedKmh: 15,
    alertLevel: 'VERT',
    alerts: [
      {
        level: 'VERT',
        regions: [],
        districts: ['Ampanihy Andrefana', 'Beloha', 'Tsihombe'],
      },
    ],
    lifted: NO_LIFT,
    content:
      "Bulletin cyclonique spécial du 14 février 2026 à 11 heures locales. À 10 heures locales, le cyclone tropical GEZANI était positionné à 898 km à l'Ouest d'Itampolo / Ampanihy. Le vent moyen est estimé à 155 km/h, avec des rafales de l'ordre de 210 km/h. Il s'est déplacé vers le Sud à raison de 15 km/h. Dans les deux prochains jours, ce système entamera un déplacement vers l'Est puis Nord-Est, l'amenant ainsi à évoluer à environ 150 km au large du littoral d'Itampolo dans la nuit de lundi. Face à une éventualité de coups de vent (65 km/h) le long de la côte Sud-Ouest, les populations des districts suivants sont priées d'appliquer les prescriptions d'alerte verte : Ampanihy Andrefana, Beloha et Tsihombe. La sortie en mer entre Morombe et Cap Sainte-Marie est déconseillée à compter de demain, en fin de matinée, car la mer deviendra progressivement forte à très forte.",
  },
  {
    reference: '18/10',
    kind: 'SPECIAL',
    publishedAt: '2026-02-15T10:00:00+03:00',
    observedAt: '2026-02-15T06:00:00Z',
    title:
      'Bulletin cyclonique spécial du 15 février 2026 à 10h00 (observation de 09h00, heure de Madagascar) — N° 18/10',
    positionDescription: "Centre situé à 549 km au Sud-Ouest d'Itampolo / Ampanihy.",
    windKmh: 120,
    gustKmh: 170,
    movementDirection: 'Est',
    movementSpeedKmh: 20,
    alertLevel: 'VERT',
    alerts: [
      {
        level: 'VERT',
        regions: [],
        districts: ['Ampanihy Andrefana', 'Beloha', 'Tsihombe'],
      },
    ],
    lifted: NO_LIFT,
    content:
      "Bulletin cyclonique spécial du 15 février 2026 à 10 heures locales. À 09 heures locales, le cyclone tropical GEZANI était centré à 549 km au Sud-Ouest d'Itampolo / Ampanihy. Il s'est affaibli graduellement. Le vent moyen est estimé à 120 km/h, avec des rafales de l'ordre de 170 km/h. Il s'est déplacé vers l'Est à une vitesse moyenne de 20 km/h. Dans les 24 prochaines heures, ce système poursuivra un cap vers le Nord-Est, l'amenant ainsi à évoluer à environ 100 km au large du littoral d'Itampolo dans la nuit de lundi. Face à une éventualité de coups de vent (65 km/h) le long de la côte Sud-Ouest, les populations des districts suivants sont priées d'appliquer les prescriptions d'alerte verte : Ampanihy Andrefana, Beloha et Tsihombe. La sortie en mer entre Maintirano et Taolagnaro est fortement déconseillée à compter de cet après-midi, car la mer deviendra progressivement forte puis très forte.",
  },
  {
    reference: '19/10',
    kind: 'SPECIAL',
    publishedAt: '2026-02-15T16:00:00+03:00',
    observedAt: '2026-02-15T12:00:00Z',
    title:
      'Bulletin cyclonique spécial du 15 février 2026 à 16h00 (observation de 15h00, heure de Madagascar) — N° 19/10',
    positionDescription: "Centre situé à 467 km au Sud-Ouest d'Itampolo / Ampanihy.",
    windKmh: 120,
    gustKmh: 170,
    movementDirection: 'Est',
    movementSpeedKmh: 15,
    alertLevel: 'JAUNE',
    alerts: [
      {
        level: 'JAUNE',
        regions: [],
        districts: ['Ampanihy Andrefana', 'Beloha', 'Tsihombe'],
      },
    ],
    lifted: NO_LIFT,
    content:
      "Bulletin cyclonique spécial du 15 février 2026 à 16 heures locales. À 15 heures locales, le cyclone tropical GEZANI était centré à 467 km au Sud-Ouest d'Itampolo / Ampanihy. Le vent moyen est estimé à 120 km/h, avec des rafales de l'ordre de 170 km/h. Il s'est déplacé vers l'Est à une vitesse moyenne de 15 km/h. Dans les 24 prochaines heures, ce système poursuivra un cap vers le Nord-Est, l'amenant ainsi à évoluer à environ 100 km au large du littoral d'Itampolo demain après-midi et la nuit. Face à une éventualité de coups de vent (65 km/h) le long de la côte Sud-Ouest, les populations des districts suivants sont priées d'appliquer les prescriptions d'alerte jaune (menace) : Ampanihy Andrefana, Beloha et Tsihombe. Le risque de fortes pluies est relativement faible car les activités pluvieuses devront rester concentrées en mer. La sortie en mer entre Maintirano et Taolagnaro est déconseillée car la mer deviendra progressivement forte, puis très forte.",
  },
  {
    reference: '20/10',
    kind: 'SPECIAL',
    publishedAt: '2026-02-16T10:00:00+03:00',
    observedAt: '2026-02-16T06:00:00Z',
    title:
      'Bulletin cyclonique spécial du 16 février 2026 à 10h00 (observation de 09h00, heure de Madagascar) — N° 20/10',
    positionDescription: "Centre situé à 240 km à l'Ouest d'Itampolo / Ampanihy.",
    windKmh: 100,
    gustKmh: 140,
    movementDirection: 'Nord-Est',
    movementSpeedKmh: 13,
    alertLevel: 'ROUGE',
    alerts: [
      { level: 'ROUGE', regions: [], districts: ['Ampanihy Andrefana'] },
      { level: 'JAUNE', regions: [], districts: ['Beloha', 'Tsihombe'] },
    ],
    lifted: NO_LIFT,
    content:
      "Bulletin cyclonique spécial du 16 février 2026 à 10 heures locales. À 09 heures locales, GEZANI était centré à 240 km à l'Ouest d'Itampolo / Ampanihy. Elle s'est affaiblie en forte tempête tropicale. Le vent moyen est estimé à 100 km/h, avec des rafales de l'ordre de 140 km/h près de son centre. Il s'est déplacé vers le Nord-Est à une vitesse moyenne de 13 km/h. Ce système devrait se rapprocher davantage du littoral d'Ampanihy Andrefana ce soir ou dans la nuit, avant un changement de cap vers le Sud, pour s'éloigner définitivement de nos côtes. Ainsi, les littoraux Sud et Sud-Ouest risquent d'être affectés par des coups de vent (65 km/h). Alertes cycloniques : alerte rouge (danger imminent) pour Ampanihy Andrefana ; alerte jaune (menace) pour Beloha et Tsihombe. Le risque de fortes pluies est relativement faible car les activités pluvieuses devront rester concentrées en mer.",
  },
  {
    reference: '21/10',
    kind: 'SPECIAL',
    publishedAt: '2026-02-16T16:00:00+03:00',
    observedAt: '2026-02-16T12:00:00Z',
    title:
      'Bulletin cyclonique spécial du 16 février 2026 à 16h00 (observation de 15h00, heure de Madagascar) — N° 21/10',
    positionDescription: "Centre situé à 162 km à l'Ouest d'Itampolo / Ampanihy.",
    windKmh: 80,
    gustKmh: 110,
    movementDirection: 'Est',
    movementSpeedKmh: 11,
    alertLevel: 'ROUGE',
    alerts: [
      { level: 'ROUGE', regions: [], districts: ['Ampanihy Andrefana', 'Beloha'] },
      { level: 'JAUNE', regions: [], districts: ['Tsihombe'] },
    ],
    lifted: NO_LIFT,
    content:
      "Bulletin cyclonique spécial du 16 février 2026 à 16 heures locales. À 15 heures locales, GEZANI était centré à 162 km à l'Ouest d'Itampolo / Ampanihy. Elle a continué de s'affaiblir. Au stade de tempête tropicale modérée, le vent moyen est estimé à 80 km/h, avec des rafales de l'ordre de 110 km/h près de son centre. Elle s'est déplacée vers l'Est à une vitesse moyenne de 11 km/h. Ce système devrait se rapprocher davantage du littoral d'Ampanihy Andrefana dans la nuit, avant un changement de cap vers le Sud, pour s'éloigner définitivement de nos côtes. Ainsi, les littoraux Sud et Sud-Ouest risquent d'être affectés par des coups de vent (65 km/h). Alertes cycloniques : alerte rouge (danger imminent) pour Ampanihy Andrefana et Beloha ; alerte jaune (menace) pour Tsihombe. Le risque de fortes pluies est relativement faible car les activités pluvieuses devront rester concentrées en mer.",
  },
  {
    reference: '22/10',
    kind: 'SPECIAL',
    publishedAt: '2026-02-16T22:00:00+03:00',
    observedAt: '2026-02-16T18:00:00Z',
    title:
      'Bulletin cyclonique spécial du 16 février 2026 à 22h00 (observation de 21h00, heure de Madagascar) — N° 22/10',
    positionDescription: "Centre situé à 112 km au Sud-Sud-Ouest d'Itampolo / Ampanihy.",
    windKmh: 110,
    gustKmh: 155,
    movementDirection: 'Est-Sud-Est',
    movementSpeedKmh: 20,
    alertLevel: 'ROUGE',
    alerts: [
      { level: 'ROUGE', regions: [], districts: ['Ampanihy Andrefana', 'Beloha'] },
      { level: 'JAUNE', regions: [], districts: ['Tsihombe'] },
    ],
    lifted: NO_LIFT,
    content:
      "Bulletin cyclonique spécial du 16 février 2026 à 22 heures locales. À 21 heures locales, GEZANI était centré à 112 km au Sud-Sud-Ouest d'Itampolo / Ampanihy. Elle s'est légèrement intensifiée. Le vent moyen est estimé à 110 km/h, avec des rafales de l'ordre de 155 km/h près de son centre. Elle s'est déplacée vers l'Est-Sud-Est à une vitesse moyenne de 20 km/h. Il semble que GEZANI passe actuellement à la distance la plus proche du littoral. Elle devrait ensuite poursuivre un cap vers le Sud, pour s'éloigner définitivement de nos côtes. Les alertes cycloniques restent inchangées : alerte rouge (danger imminent) pour Ampanihy Andrefana et Beloha ; alerte jaune (menace) pour Tsihombe. Le risque de fortes pluies est relativement faible car les activités pluvieuses sont en grande partie concentrées en mer.",
  },
  {
    reference: '23/10',
    kind: 'SPECIAL',
    publishedAt: '2026-02-17T04:00:00+03:00',
    observedAt: '2026-02-17T00:00:00Z',
    title:
      'Bulletin cyclonique spécial du 17 février 2026 à 04h00 (observation de 03h00, heure de Madagascar) — N° 23/10',
    positionDescription: "Centre situé à 157 km au Sud-Ouest de Faux Cap / Tsihombe.",
    windKmh: 100,
    gustKmh: 140,
    movementDirection: 'Sud-Sud-Est',
    movementSpeedKmh: 25,
    alertLevel: 'BLEU',
    alerts: [
      {
        level: 'BLEU',
        regions: [],
        districts: ['Ampanihy Andrefana', 'Beloha', 'Tsihombe'],
      },
    ],
    lifted: NO_LIFT,
    content:
      "Bulletin cyclonique spécial du 17 février 2026 à 04 heures locales. À 03 heures locales, GEZANI était centré à 157 km au Sud-Ouest de Faux Cap / Tsihombe. Le vent moyen associé est estimé à 100 km/h, avec des rafales de l'ordre de 140 km/h près de son centre. Elle s'est déplacée vers le Sud-Sud-Est à une vitesse moyenne de 25 km/h. GEZANI devrait poursuivre un cap globalement vers le Sud, en s'éloignant définitivement des côtes Sud. Alertes cycloniques : alerte bleue (vigilance post-cyclone) pour Ampanihy Andrefana, Beloha et Tsihombe. La sortie en mer entre Maintirano et Taolagnaro reste déconseillée car les conditions de navigation sont maussades.",
  },
  {
    reference: '24/10',
    kind: 'SPECIAL',
    publishedAt: '2026-02-17T10:00:00+03:00',
    observedAt: '2026-02-17T06:00:00Z',
    title:
      'Bulletin cyclonique spécial du 17 février 2026 à 10h00 (observation de 09h00, heure de Madagascar) — N° 24/10 — dernier bulletin',
    positionDescription: "Centre localisé à 431 km au Sud-Ouest de Faux Cap / Tsihombe.",
    windKmh: 90,
    gustKmh: 125,
    movementDirection: 'Sud-Sud-Ouest',
    movementSpeedKmh: 50,
    alertLevel: null,
    alerts: [],
    lifted: {
      regions: [],
      districts: ['Ampanihy Andrefana', 'Beloha', 'Tsihombe'],
    },
    content:
      "Bulletin cyclonique spécial du 17 février 2026 à 10 heures locales. À 09 heures locales, la forte tempête tropicale GEZANI était localisée à 431 km au Sud-Ouest de Faux Cap / Tsihombe. Le vent moyen est estimé à 90 km/h, avec des rafales locales de 125 km/h. Elle s'est déplacée vers le Sud-Sud-Ouest en s'éloignant davantage des côtes, à un rythme de 50 km/h. Ainsi, GEZANI ne présente plus une menace potentielle pour le territoire national. Toutes les alertes cycloniques sont levées. La sortie en mer entre Morombe et Taolagnaro reste déconseillée pour aujourd'hui car les conditions de navigation sont maussades. Ceci est le dernier bulletin concernant GEZANI.",
  },

  // --- Bulletins flash (« Vaovao Tselatra ») ---------------------------------
  {
    reference: '01/10',
    kind: 'FLASH',
    publishedAt: '2026-02-10T07:00:00+03:00',
    observedAt: '2026-02-10T07:00:00Z',
    title:
      'Bulletin flash (« Vaovao Tselatra ») du 10 février 2026 à 07h00 — N° 01/10',
    positionDescription: "Centre situé à 240 km à l'Est de Toamasina.",
    windKmh: 150,
    gustKmh: 210,
    movementDirection: 'Ouest',
    movementSpeedKmh: 17,
    alertLevel: null,
    alerts: FLASH_ALERTS,
    lifted: NO_LIFT,
    content:
      "Bulletin flash (« Vaovao Tselatra ») du 10 février 2026 à 07 heures locales, N° 01/10. 1. Position du centre : 240 km à l'Est de Toamasina. 2. Intensité : cyclone tropical — vent moyen 150 km/h, rafales de 210 km/h près du centre. 3. Déplacement : vers l'Ouest. 4. Vitesse de déplacement : 17 km/h. 5. Lieu d'atterrissage prévu : district de Toamasina II. 6. Remarque : il est estimé qu'il deviendra un cyclone tropical intense (rafales d'environ 250 km/h) au moment de l'atterrissage cet après-midi ou la nuit. Prochain bulletin flash : à 13 heures locales. Prochain bulletin spécial : à 10 heures locales. Ce bulletin flash ne reprend pas la répartition des alertes cycloniques : celle du bulletin spécial N° 10/10 (04 heures locales) reste en vigueur.",
  },
  {
    reference: '02/10',
    kind: 'FLASH',
    publishedAt: '2026-02-10T13:00:00+03:00',
    observedAt: '2026-02-10T13:00:00Z',
    title:
      'Bulletin flash (« Vaovao Tselatra ») du 10 février 2026 à 13h00 — N° 02/10',
    positionDescription: "Centre situé à 117 km à l'Est de Toamasina.",
    windKmh: 165,
    gustKmh: 230,
    movementDirection: 'Ouest',
    movementSpeedKmh: 18,
    alertLevel: null,
    alerts: FLASH_ALERTS,
    lifted: NO_LIFT,
    content:
      "Bulletin flash (« Vaovao Tselatra ») du 10 février 2026 à 13 heures locales, N° 02/10. 1. Position du centre : 117 km à l'Est de Toamasina. 2. Intensité : cyclone tropical intense — vent moyen 165 km/h, rafales de 230 km/h près du centre. 3. Déplacement : vers l'Ouest. 4. Vitesse de déplacement : 18 km/h. 5. Lieu d'atterrissage prévu : district de Toamasina II. 6. Remarque : il est attendu à terre ce soir vers 22 heures locales. Prochain bulletin flash : le 11 février 2026 à 01 heure du matin. Prochain bulletin spécial : à 16 heures locales. Ce bulletin flash ne reprend pas la répartition des alertes cycloniques : celle du bulletin spécial N° 11/10 (10 heures locales) reste en vigueur.",
  },
  {
    reference: '03/10',
    kind: 'FLASH',
    publishedAt: '2026-02-10T19:00:00+03:00',
    observedAt: '2026-02-10T19:00:00Z',
    title:
      'Bulletin flash (« Vaovao Tselatra ») du 10 février 2026 à 19h00 — N° 03/10',
    positionDescription: "Centre situé à 20 km à l'Est de Toamasina.",
    windKmh: 195,
    gustKmh: 270,
    movementDirection: 'Ouest',
    movementSpeedKmh: 16,
    alertLevel: null,
    alerts: FLASH_ALERTS,
    lifted: NO_LIFT,
    content:
      "Bulletin flash (« Vaovao Tselatra ») du 10 février 2026 à 19 heures locales, N° 03/10. 1. Position du centre : 20 km à l'Est de Toamasina. 2. Intensité : cyclone tropical intense — vent moyen 195 km/h, rafales de 270 km/h près du centre. 3. Déplacement : vers l'Ouest. 4. Vitesse de déplacement : 16 km/h. 5. Lieu d'atterrissage prévu : district de Toamasina II. 6. Remarque : il est estimé qu'il touchera terre ce soir vers 22 heures. Prochain bulletin flash : le 11 février 2026 à 01 heure du matin. Prochain bulletin spécial : à 22 heures locales. Ce bulletin flash ne reprend pas la répartition des alertes cycloniques : celle du bulletin spécial N° 12/10 (16 heures locales) reste en vigueur.",
  },
  {
    reference: '04/10',
    kind: 'FLASH',
    publishedAt: '2026-02-11T01:00:00+03:00',
    observedAt: '2026-02-11T01:00:00Z',
    title:
      'Bulletin flash (« Vaovao Tselatra ») du 11 février 2026 à 01h00 — N° 04/10',
    positionDescription: 'Centre positionné dans la commune de Kaominina Fito / district de Toamasina II.',
    windKmh: 110,
    gustKmh: 155,
    movementDirection: 'Ouest',
    movementSpeedKmh: 17,
    alertLevel: null,
    alerts: FLASH_ALERTS,
    lifted: NO_LIFT,
    content:
      "Bulletin flash (« Vaovao Tselatra ») du 11 février 2026 à 01 heure du matin, N° 04/10. 1. Position du centre : commune de Kaominina Fito / district de Toamasina II. 2. Intensité : forte tempête tropicale — vent moyen 110 km/h, rafales de 155 km/h près du centre. 3. Déplacement : vers l'Ouest. 4. Vitesse de déplacement : 17 km/h. 5. Remarque : son intensité diminue progressivement. Prochain bulletin flash : à 07 heures du matin. Prochain bulletin spécial : à 04 heures du matin. Ce bulletin flash ne reprend pas la répartition des alertes cycloniques : celle du bulletin spécial N° 14/10 (10 février, 22 heures locales) reste en vigueur.",
  },
  {
    reference: '05/10',
    kind: 'FLASH',
    publishedAt: '2026-02-11T07:00:00+03:00',
    observedAt: '2026-02-11T07:00:00Z',
    title:
      'Bulletin flash (« Vaovao Tselatra ») du 11 février 2026 à 07h00 — N° 05/10',
    positionDescription: "Centre positionné dans le district d'Ankazobe.",
    windKmh: 80,
    gustKmh: 110,
    movementDirection: 'Ouest',
    movementSpeedKmh: 22,
    alertLevel: null,
    alerts: FLASH_ALERTS,
    lifted: NO_LIFT,
    content:
      "Bulletin flash (« Vaovao Tselatra ») du 11 février 2026 à 07 heures du matin, N° 05/10. 1. Position du centre : district d'Ankazobe. 2. Intensité : tempête tropicale modérée — vent moyen 80 km/h, rafales de 110 km/h près du centre. 3. Déplacement : vers l'Ouest. 4. Vitesse de déplacement : 22 km/h. 5. Remarque : son intensité diminue progressivement. Prochain bulletin flash : à 13 heures. Prochain bulletin spécial : à 10 heures du matin. Ce bulletin flash ne reprend pas la répartition des alertes cycloniques : celle du bulletin spécial N° 14/10 (11 février, 04 heures locales) reste en vigueur.",
  },
  {
    reference: '06/10',
    kind: 'FLASH',
    publishedAt: '2026-02-11T13:00:00+03:00',
    observedAt: '2026-02-11T13:00:00Z',
    title:
      'Bulletin flash (« Vaovao Tselatra ») du 11 février 2026 à 13h00 — N° 06/10',
    positionDescription: 'Centre positionné dans le district de Miandrivazo.',
    windKmh: 40,
    gustKmh: 50,
    movementDirection: 'Ouest-Sud-Ouest',
    movementSpeedKmh: 28,
    alertLevel: null,
    alerts: FLASH_ALERTS,
    lifted: NO_LIFT,
    content:
      "Bulletin flash (« Vaovao Tselatra ») du 11 février 2026 à 13 heures, N° 06/10. 1. Position du centre : district de Miandrivazo. 2. Intensité : dépression sur terre — vent moyen 40 km/h, rafales de 50 km/h sous averses. 3. Déplacement : vers l'Ouest, légèrement Sud-Ouest. 4. Vitesse de déplacement : 28 km/h. 5. Remarque : son intensité continue de diminuer. Prochain bulletin flash : aucun. Prochain bulletin spécial : à 16 heures. Ce bulletin flash ne reprend pas la répartition des alertes cycloniques : celle du bulletin spécial N° 15/10 (11 février, 10 heures locales) reste en vigueur.",
  },
];

/** Niveaux publiés par ce bulletin, au format `weather_bulletins.alert_levels`. */
export function bulletinAlertLevels(bulletin: GezaniBulletin): Record<string, string[]> {
  const keys: Record<GezaniAlertLevel, string> = {
    ROUGE: 'rouge',
    JAUNE: 'jaune',
    BLEU: 'bleu',
    VERT: 'verte',
  };
  const payload: Record<string, string[]> = {};
  for (const group of bulletin.alerts) {
    payload[keys[group.level]] = [...group.regions, ...group.districts];
  }
  const lifted = [...bulletin.lifted.regions, ...bulletin.lifted.districts];
  if (lifted.length > 0) {
    payload.levee = lifted;
  }
  return payload;
}
