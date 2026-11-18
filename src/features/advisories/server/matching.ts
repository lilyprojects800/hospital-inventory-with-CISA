import type { Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";
import {
  type AdvisoryMatch,
  type MatchableProduct,
  matchAssetToAdvisory,
  type RemediationLevelValue,
  relevantToProducts,
  remediationLevel,
} from "../lib/match";
import { vendorsMatch } from "../lib/products";

type AdvisoryIndex = {
  id: string;
  severity: number;
  vendors: string[];
  products: MatchableProduct[];
  vulnerabilities: { cvssScore: number | null; productIds: string[] }[];
  remediations: Prisma.RemediationGetPayload<{
    select: { category: true; productIds: true };
  }>[];
};

type DesiredMatch = AdvisoryMatch & {
  assetId: string;
  advisoryId: string;
  severity: number;
  remediation: RemediationLevelValue;
};

async function loadAdvisoryIndex(): Promise<AdvisoryIndex[]> {
  const advisories = await prisma.advisory.findMany({
    select: {
      id: true,
      severity: true,
      products: {
        where: { status: { in: ["AFFECTED", "UNDER_INVESTIGATION"] } },
        select: {
          productId: true,
          vendor: true,
          productName: true,
          versionSpec: true,
          status: true,
        },
      },
      vulnerabilities: { select: { cvssScore: true, productIds: true } },
      remediations: { select: { category: true, productIds: true } },
    },
  });
  return advisories
    .filter((advisory) => advisory.products.length > 0)
    .map((advisory) => ({
      ...advisory,
      vendors: [...new Set(advisory.products.map((p) => p.vendor))],
    }));
}

function describeMatch(
  assetId: string,
  advisory: AdvisoryIndex,
  match: AdvisoryMatch,
): DesiredMatch {
  const vulnerabilities = relevantToProducts(
    advisory.vulnerabilities,
    match.matchedProductIds,
  );
  const scores = vulnerabilities
    .map((v) => v.cvssScore)
    .filter((score): score is number => score !== null);
  const remediations = relevantToProducts(
    advisory.remediations,
    match.matchedProductIds,
  );
  return {
    ...match,
    assetId,
    advisoryId: advisory.id,
    severity: scores.length > 0 ? Math.max(...scores) : advisory.severity,
    remediation: remediationLevel(remediations.map((r) => r.category)),
  };
}

export function computeMatches(
  assets: Prisma.AssetGetPayload<{
    select: {
      id: true;
      manufacturer: true;
      product: true;
      version: true;
      versionStatus: true;
    };
  }>[],
  advisories: AdvisoryIndex[],
): DesiredMatch[] {
  const vendorCache = new Map<string, boolean>();
  const sameVendor = (assetVendor: string, advisoryVendor: string) => {
    const key = `${assetVendor}\u0000${advisoryVendor}`;
    let result = vendorCache.get(key);
    if (result === undefined) {
      result = vendorsMatch(assetVendor, advisoryVendor);
      vendorCache.set(key, result);
    }
    return result;
  };

  const desired: DesiredMatch[] = [];
  for (const asset of assets) {
    for (const advisory of advisories) {
      if (!advisory.vendors.some((v) => sameVendor(asset.manufacturer, v))) {
        continue;
      }
      const match = matchAssetToAdvisory(asset, advisory.products);
      if (match) desired.push(describeMatch(asset.id, advisory, match));
    }
  }
  return desired;
}

const sameMatch = (
  existing: {
    status: string;
    reason: string;
    matchedProductIds: string[];
    severity: number;
    remediation: string;
  },
  next: DesiredMatch,
) =>
  existing.status === next.status &&
  existing.reason === next.reason &&
  existing.severity === next.severity &&
  existing.remediation === next.remediation &&
  existing.matchedProductIds.join("|") === next.matchedProductIds.join("|");

export async function refreshAssetExposure() {
  await prisma.$executeRaw`
    WITH summary AS (
      SELECT
        a."id",
        CASE
          WHEN bool_or(m."status" = 'AFFECTED') THEN 'AFFECTED'
          WHEN count(m."id") > 0 THEN 'POSSIBLY_AFFECTED'
          ELSE 'NONE'
        END AS exposure,
        COALESCE(max(m."severity"), 0) AS max_severity,
        count(m."id")::int AS advisory_count,
        CASE
          WHEN count(m."id") = 0 THEN NULL
          WHEN bool_or(m."remediation" = 'NO_REMEDIATION') THEN 'NO_REMEDIATION'
          WHEN bool_or(m."remediation" = 'MITIGATION_ONLY') THEN 'MITIGATION_ONLY'
          ELSE 'VENDOR_FIX'
        END AS remediation
      FROM "asset" a
      LEFT JOIN "asset_advisory_match" m ON m."assetId" = a."id"
      GROUP BY a."id"
    )
    UPDATE "asset" AS target
    SET
      "exposure" = summary.exposure::"Exposure",
      "maxSeverity" = summary.max_severity,
      "advisoryCount" = summary.advisory_count,
      "remediation" = summary.remediation::"RemediationLevel"
    FROM summary
    WHERE target."id" = summary."id"
      AND (
        target."exposure" IS DISTINCT FROM summary.exposure::"Exposure"
        OR target."maxSeverity" IS DISTINCT FROM summary.max_severity
        OR target."advisoryCount" IS DISTINCT FROM summary.advisory_count
        OR target."remediation" IS DISTINCT FROM summary.remediation::"RemediationLevel"
      )
  `;
}

export async function rematchAssets(assetIds?: string[]) {
  const assetWhere = assetIds ? { id: { in: assetIds } } : {};
  const [assets, advisories] = await Promise.all([
    prisma.asset.findMany({
      where: assetWhere,
      select: {
        id: true,
        manufacturer: true,
        product: true,
        version: true,
        versionStatus: true,
      },
    }),
    loadAdvisoryIndex(),
  ]);
  const desired = computeMatches(assets, advisories);
  const existing = await prisma.assetAdvisoryMatch.findMany({
    where: assetIds ? { assetId: { in: assetIds } } : {},
  });

  const key = (m: { assetId: string; advisoryId: string }) =>
    `${m.assetId}|${m.advisoryId}`;
  const existingByKey = new Map(existing.map((m) => [key(m), m]));
  const desiredKeys = new Set(desired.map(key));

  const stale = existing.filter((m) => !desiredKeys.has(key(m)));
  const created = desired.filter((m) => !existingByKey.has(key(m)));
  const changed = desired.filter((m) => {
    const current = existingByKey.get(key(m));
    return current && !sameMatch(current, m);
  });

  await prisma.$transaction([
    prisma.assetAdvisoryMatch.deleteMany({
      where: { id: { in: stale.map((m) => m.id) } },
    }),
    prisma.assetAdvisoryMatch.createMany({
      data: created.map((m) => ({
        assetId: m.assetId,
        advisoryId: m.advisoryId,
        status: m.status,
        reason: m.reason,
        matchedProductIds: m.matchedProductIds,
        severity: m.severity,
        remediation: m.remediation,
      })),
    }),
    ...changed.map((m) =>
      prisma.assetAdvisoryMatch.update({
        where: {
          assetId_advisoryId: { assetId: m.assetId, advisoryId: m.advisoryId },
        },
        data: {
          status: m.status,
          reason: m.reason,
          matchedProductIds: m.matchedProductIds,
          severity: m.severity,
          remediation: m.remediation,
        },
      }),
    ),
  ]);
  await refreshAssetExposure();

  return {
    assets: assets.length,
    matches: desired.length,
    created: created.length,
    updated: changed.length,
    removed: stale.length,
  };
}
