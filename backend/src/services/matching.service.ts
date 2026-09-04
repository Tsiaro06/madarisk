import { AppError } from '../utils/app-error';
import { importsRepository } from '../repositories/imports.repository';
import { matchingRepository } from '../repositories/matching.repository';
import { usersRepository } from '../repositories/users.repository';
import { normalizeName, normalizeCode, similarityPercent } from '../utils/territory-normalizer';
import {
  ImportsTerritoryType,
  MatchingDecision,
  MatchingMethod,
  MatchingRunResult,
  MatchingStatus,
  SourceRecord,
} from '../types/imports.types';
import {
  ListMatchingQuery,
  ManualLinkInput,
} from '../validators/matching.validator';
import { IncomingHttpHeaders } from 'http';

interface RequestContext {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: IncomingHttpHeaders;
}

interface Candidate {
  id: string;
  type: ImportsTerritoryType;
  adminCode: string | null;
  normalizedName: string;
}

interface AliasEntry {
  type: ImportsTerritoryType;
  districtId: string | null;
  communeId: string | null;
  normalizedAlias: string;
}

function getIp(req: RequestContext): string | null {
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

function buildDecision(
  method: MatchingMethod,
  confidence: number,
  candidate?: Candidate,
): MatchingDecision {
  if (!candidate) {
    return { targetType: null, territoryId: null, method, confidence, status: 'AMBIGU' };
  }
  return {
    targetType: candidate.type,
    territoryId: candidate.id,
    method,
    confidence,
    status: 'EN_ATTENTE',
  };
}

function decideForSourceRecord(
  record: SourceRecord,
  candidates: Candidate[],
  aliases: AliasEntry[],
): MatchingDecision {
  // 1. Code administratif exact
  if (record.sourceCode) {
    const code = normalizeCode(record.sourceCode);
    const byCode = candidates.filter((c) => c.adminCode && normalizeCode(c.adminCode) === code);
    if (byCode.length === 1) return buildDecision('CODE_ADMINISTRATIF', 100, byCode[0]);
    if (byCode.length > 1) return buildDecision('CODE_ADMINISTRATIF', 100);
  }

  // 2. Nom normalisé exact
  if (record.sourceName) {
    const norm = normalizeName(record.sourceName);
    const byName = candidates.filter((c) => normalizeName(c.normalizedName) === norm);
    if (byName.length === 1) return buildDecision('NOM_NORMALISE', 98, byName[0]);
    if (byName.length > 1) return buildDecision('NOM_NORMALISE', 98);
  }

  // 3. Alias
  if (record.sourceName) {
    const norm = normalizeName(record.sourceName);
    const byAlias = aliases.filter((a) => normalizeName(a.normalizedAlias) === norm);
    if (byAlias.length === 1) {
      const alias = byAlias[0];
      return {
        targetType: alias.type,
        territoryId: alias.type === 'DISTRICT' ? alias.districtId : alias.communeId,
        method: 'ALIAS',
        confidence: 96,
        status: 'EN_ATTENTE',
      };
    }
    if (byAlias.length > 1) return buildDecision('ALIAS', 96);
  }

  // 4. Similarité contrôlée
  if (record.sourceName) {
    const scored = candidates
      .map((c) => ({ candidate: c, score: similarityPercent(record.sourceName ?? '', c.normalizedName) }))
      .filter((x) => x.score >= 95)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 1) {
      return buildDecision('FUZZY_MATCHING', scored[0].score, scored[0].candidate);
    }
    if (scored.length > 1) {
      const top = scored[0].score;
      const good = scored.filter((x) => x.score === top);
      if (good.length === 1) {
        return buildDecision('FUZZY_MATCHING', top, good[0].candidate);
      }
      return buildDecision('FUZZY_MATCHING', top);
    }
  }

  return {
    targetType: null,
    territoryId: null,
    method: null,
    confidence: null,
    status: 'EN_ATTENTE',
  };
}

export const matchingService = {
  async run(importId: string, actor: { id: string }, req: RequestContext): Promise<MatchingRunResult> {
    const importRecord = await importsRepository.findById(importId);
    if (!importRecord) throw AppError.notFound('Import introuvable');
    if (importRecord.status !== 'TERMINE') {
      throw AppError.badRequest('L\'import doit être terminé avant d\'être traité');
    }

    const records = await importsRepository.listSourceRecords(importId);

    const scopedType = importRecord.territoryType;
    const types: ImportsTerritoryType[] =
      scopedType === null ? ['DISTRICT', 'COMMUNE'] : [scopedType];

    const candidates: Candidate[] = [];
    const aliases: AliasEntry[] = [];

    for (const type of types) {
      const terr = await matchingRepository.listTerritories(type);
      for (const t of terr) {
        candidates.push({ id: t.id, type, adminCode: t.adminCode, normalizedName: t.normalizedName });
      }
      const aliasRows = await matchingRepository.listAliases(type);
      for (const a of aliasRows) {
        aliases.push({ type, districtId: a.districtId, communeId: a.communeId, normalizedAlias: a.normalizedAlias });
      }
    }

    const rows: Array<{
      sourceRecordId: string;
      targetType: ImportsTerritoryType;
      districtId?: string | null;
      communeId?: string | null;
      matchMethod: MatchingMethod;
      confidenceScore: number;
      status: MatchingStatus;
      notes?: string | null;
    }> = [];

    let proposed = 0;
    let ambiguous = 0;
    let unmatched = 0;

    for (const record of records) {
      const decision = decideForSourceRecord(record, candidates, aliases);

      if (!decision.territoryId) {
        if (decision.status === 'AMBIGU') ambiguous += 1;
        else unmatched += 1;
        continue;
      }

      proposed += 1;

      const targetType: ImportsTerritoryType = decision.targetType ?? 'DISTRICT';

      rows.push({
        sourceRecordId: record.id,
        targetType,
        districtId: decision.targetType === 'DISTRICT' ? decision.territoryId : null,
        communeId: decision.targetType === 'COMMUNE' ? decision.territoryId : null,
        matchMethod: decision.method ?? 'NOM_NORMALISE',
        confidenceScore: decision.confidence ?? 0,
        status: 'EN_ATTENTE',
        notes: null,
      });
    }

    await matchingRepository.bulkCreate(rows);

    await usersRepository.writeAudit({
      userId: actor.id,
      action: 'MATCHING_RUN',
      entityType: 'territory_import',
      entityId: importId,
      newValue: { records: records.length, proposed, ambiguous, unmatched },
      ipAddress: getIp(req),
    });

    return { total: records.length, proposed, ambiguous, unmatched };
  },

  async list(query: ListMatchingQuery): Promise<{
    items: Awaited<ReturnType<typeof matchingRepository.list>>['items'];
    page: number;
    limit: number;
    total: number;
  }> {
    const { items, total } = await matchingRepository.list(query);
    return { items, page: query.page, limit: query.limit, total };
  },

  async approve(id: string, actor: { id: string }, req: RequestContext) {
    const matching = await matchingRepository.findById(id);
    if (!matching) throw AppError.notFound('Correspondance introuvable');

    const updated = await matchingRepository.updateDecision(id, {
      status: 'VALIDE',
      reviewedBy: actor.id,
    });

    await usersRepository.writeAudit({
      userId: actor.id,
      action: 'MATCHING_APPROVED',
      entityType: 'territory_matching',
      entityId: id,
      newValue: { status: 'VALIDE' },
      ipAddress: getIp(req),
    });

    return updated;
  },

  async reject(id: string, notes: string, actor: { id: string }, req: RequestContext) {
    const matching = await matchingRepository.findById(id);
    if (!matching) throw AppError.notFound('Correspondance introuvable');

    const updated = await matchingRepository.updateDecision(id, {
      status: 'REJETE',
      notes,
      reviewedBy: actor.id,
    });

    await usersRepository.writeAudit({
      userId: actor.id,
      action: 'MATCHING_REJECTED',
      entityType: 'territory_matching',
      entityId: id,
      newValue: { status: 'REJETE', notes },
      ipAddress: getIp(req),
    });

    return updated;
  },

  async manualLink(input: ManualLinkInput, actor: { id: string }, req: RequestContext) {
    const matchedType = input.targetType;
    const created = await matchingRepository.create({
      sourceRecordId: input.sourceRecordId,
      targetType: matchedType,
      districtId: matchedType === 'DISTRICT' ? input.districtId : null,
      communeId: matchedType === 'COMMUNE' ? input.communeId : null,
      matchMethod: 'MANUEL',
      confidenceScore: 100,
      status: 'VALIDE',
      reviewedBy: actor.id,
      reviewedAt: new Date().toISOString(),
    });

    if (input.createAlias && input.alias && input.districtId) {
      await matchingRepository.createAlias({
        territoryType: matchedType,
        districtId: matchedType === 'DISTRICT' ? input.districtId : null,
        communeId: matchedType === 'COMMUNE' ? input.communeId : null,
        alias: input.alias,
        normalizedAlias: normalizeName(input.alias),
      });
    }

    await usersRepository.writeAudit({
      userId: actor.id,
      action: 'MATCHING_MANUAL_LINK',
      entityType: 'territory_matching',
      entityId: created.id,
      newValue: { targetType: matchedType, createAlias: input.createAlias ?? false },
      ipAddress: getIp(req),
    });

    return created.id;
  },

  async statistics() {
    return matchingRepository.statistics();
  },
};
