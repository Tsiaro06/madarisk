/**
 * Libellés français des outils du socle (`backend/src/services/ai.service.ts`).
 *
 * La traçabilité d'une réponse exige de dire sur quoi elle s'appuie, et
 * « getCommuneLatestRisk » ne parle à personne en salle de crise. Un outil
 * inconnu (ajouté côté serveur après coup) reste affiché sous son nom technique
 * plutôt que d'être masqué : mieux vaut une étiquette brute qu'une source tue.
 */
const TOOL_LABELS: Record<string, string> = {
  searchTerritories: 'recherche territoriale',
  getCommuneDetails: 'fiche de commune',
  getCommuneLatestRisk: 'dernier niveau de risque',
  getPriorityCommunes: 'communes prioritaires',
  getActiveEvents: 'événements en cours',
  getEventSummary: 'synthèse de l’événement',
  getEventExposedCommunes: 'communes exposées',
  getLatestWeather: 'dernières observations météo',
  getPublishedAlerts: 'alertes publiées',
  getHistoricalEvents: 'événements historiques',
  getDashboardSummary: 'synthèse du tableau de bord',
};

/** Libellé lisible d'un outil ; repli sur le nom technique s'il est inconnu. */
export function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? tool;
}
