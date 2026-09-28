import {
  CommuneDetail,
  CommuneListItem,
  DistrictDetail,
  DistrictListItem,
  PaginatedResult,
  TerritoryFeature,
  TerritoryGeoJson,
  TerritoryRiskLevel,
  TerritorySearchResult,
} from '../types/territory.types';
import { territoriesRepository } from '../repositories/territories.repository';
import {
  CommunesMapQuery,
  DistrictsMapQuery,
  ListCommunesQuery,
  ListDistrictsQuery,
  SearchQuery,
} from '../validators/territories.validator';
import { AppError } from '../utils/app-error';

const RISK_LEVEL_PRESENTATION: Record<TerritoryRiskLevel, { displayLevel: string; color: string }> =
  {
    FAIBLE: { displayLevel: 'faible', color: '#4caf50' },
    MODERE: { displayLevel: 'modéré', color: '#ff9800' },
    ELEVE: { displayLevel: 'élevé', color: '#f44336' },
    EXTREME: { displayLevel: 'extrême', color: '#9c27b0' },
  };

function enrichRiskFeature(feature: TerritoryFeature, includeRisk: boolean): TerritoryFeature {
  const properties = feature.properties;
  if (!includeRisk) {
    return {
      ...feature,
      properties: {
        ...properties,
        riskScore: null,
        riskLevel: null,
        displayLevel: null,
        color: null,
        phase: null,
        assessedAt: null,
      },
    };
  }

  const riskLevel = properties.riskLevel as TerritoryRiskLevel | null;
  const presentation = riskLevel
    ? RISK_LEVEL_PRESENTATION[riskLevel]
    : { displayLevel: null, color: null };

  return {
    ...feature,
    properties: {
      ...properties,
      displayLevel: presentation.displayLevel,
      color: presentation.color,
    },
  };
}

export const territoriesService = {
  async listDistricts(query: ListDistrictsQuery): Promise<PaginatedResult<DistrictListItem>> {
    return territoriesRepository.listDistricts({
      page: query.page,
      limit: query.limit,
      search: query.search,
      adminCode: query.adminCode,
      includeGeometry: query.includeGeometry,
    });
  },

  async getDistrictById(id: string): Promise<DistrictDetail> {
    const district = await territoriesRepository.findDistrictById(id);
    if (!district) {
      throw AppError.notFound('District introuvable');
    }
    return district;
  },

  async listCommunes(query: ListCommunesQuery): Promise<PaginatedResult<CommuneListItem>> {
    return territoriesRepository.listCommunes({
      page: query.page,
      limit: query.limit,
      districtId: query.districtId,
      districtCode: query.districtCode,
      search: query.search,
      adminCode: query.adminCode,
      riskLevel: query.riskLevel,
      eventId: query.eventId,
      includeGeometry: query.includeGeometry,
    });
  },

  async getCommuneById(id: string): Promise<CommuneDetail> {
    const [commune, district, weather, risk, events] = await Promise.all([
      territoriesRepository.findCommuneBasic(id),
      territoriesRepository.findCommuneParent(id),
      territoriesRepository.findCommuneWeather(id),
      territoriesRepository.findCommuneRisk(id),
      territoriesRepository.findCommuneEvents(id),
    ]);

    if (!commune) {
      throw AppError.notFound('Commune introuvable');
    }

    let riskSummary = risk;
    if (risk?.riskLevel) {
      const presentation = RISK_LEVEL_PRESENTATION[risk.riskLevel];
      riskSummary = { ...risk, displayLevel: presentation.displayLevel, color: presentation.color };
    }

    return {
      commune: {
        id: commune.id,
        adminCode: commune.adminCode,
        name: commune.name,
        normalizedName: commune.normalizedName,
        postalCode: commune.postalCode,
        population: commune.population,
        vulnerabilityScore: commune.vulnerabilityScore,
        centroid: commune.centroid,
      },
      district,
      geometry: commune.geometry,
      weather,
      risk: riskSummary,
      events,
    };
  },

  async searchTerritories(query: SearchQuery): Promise<TerritorySearchResult[]> {
    const limit = query.limit ?? 20;
    const rows = await territoriesRepository.searchTerritories(query.q, limit);
    return rows;
  },

  async mapDistricts(query: DistrictsMapQuery): Promise<TerritoryGeoJson> {
    const features = await territoriesRepository.mapDistricts({
      eventId: query.eventId,
      riskLevel: query.riskLevel,
    });
    return { type: 'FeatureCollection', features };
  },

  async mapCommunes(query: CommunesMapQuery): Promise<TerritoryGeoJson> {
    const features = await territoriesRepository.mapCommunes({
      districtId: query.districtId,
      districtCode: query.districtCode,
      eventId: query.eventId,
      riskLevel: query.riskLevel,
      phase: query.phase,
    });

    const includeRisk = query.includeRisk !== false;
    return {
      type: 'FeatureCollection',
      features: features.map((f) => enrichRiskFeature(f, includeRisk)),
    };
  },
};
