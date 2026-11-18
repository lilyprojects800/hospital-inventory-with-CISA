import { z } from "zod";
import {
  Exposure,
  MatchStatus,
  RemediationCategory,
  RemediationLevel,
} from "@/generated/prisma";

export const exposureSchema = z
  .enum(Exposure)
  .describe(
    "AFFECTED when at least one advisory matches the device and its version, POSSIBLY_AFFECTED when the product matches but the version or model could not be confirmed, NONE otherwise.",
  );

export const matchStatusSchema = z.enum(MatchStatus);

export const remediationLevelSchema = z
  .enum(RemediationLevel)
  .describe(
    "The weakest remediation across the device's advisories: VENDOR_FIX, MITIGATION_ONLY, or NO_REMEDIATION.",
  );

export const remediationCategorySchema = z.enum(RemediationCategory);

export const exposureFilterSchema = z
  .enum(["all", "affected", "possibly", "any", "unfixed", "none"])
  .default("all")
  .describe(
    "Filter by advisory exposure: affected, possibly (affected), any (affected or possibly), unfixed (exposed without a vendor fix), none, or all.",
  );
export type ExposureFilter = z.infer<typeof exposureFilterSchema>;

export const assetAdvisoryPreviewSchema = z.object({
  advisoryId: z.string(),
  title: z.string(),
  status: matchStatusSchema,
  severity: z.number(),
});

export const syncStatusSchema = z.object({
  running: z.boolean(),
  lastStartedAt: z.date().nullable(),
  lastFinishedAt: z.date().nullable(),
  lastSuccessAt: z.date().nullable(),
  lastError: z.string().nullable(),
  lastChanged: z.number(),
});

export const advisorySummarySchema = z.object({
  totalAssets: z.number(),
  affectedAssets: z.number(),
  possiblyAffectedAssets: z.number(),
  unfixedAssets: z.number(),
  advisoriesTracked: z.number(),
  advisoriesMatched: z.number(),
  sync: syncStatusSchema,
});
export type AdvisorySummary = z.infer<typeof advisorySummarySchema>;

export const remediationResponseSchema = z.object({
  category: remediationCategorySchema,
  details: z.string(),
  url: z.string().nullable(),
});
export type RemediationResponse = z.infer<typeof remediationResponseSchema>;

export const vulnerabilityResponseSchema = z.object({
  cve: z.string().nullable(),
  title: z.string().nullable(),
  cwe: z.string().nullable(),
  summary: z.string().nullable(),
  cvssScore: z.number().nullable(),
  cvssSeverity: z.string().nullable(),
  cvssVector: z.string().nullable(),
});

export const assetAdvisoryMatchSchema = z.object({
  status: matchStatusSchema,
  reason: z.string(),
  severity: z.number(),
  remediation: remediationLevelSchema,
  firstDetectedAt: z.date(),
  advisory: z.object({
    id: z.string(),
    title: z.string(),
    url: z.string(),
    csafUrl: z.string(),
    summary: z.string().nullable(),
    revision: z.string(),
    revisionSummary: z.string().nullable(),
    releasedAt: z.date(),
    revisedAt: z.date(),
  }),
  affectedProducts: z.array(
    z.object({ name: z.string(), versionSpec: z.string().nullable() }),
  ),
  remediations: z.array(remediationResponseSchema),
  vulnerabilities: z.array(vulnerabilityResponseSchema),
});
export type AssetAdvisoryMatchResponse = z.infer<
  typeof assetAdvisoryMatchSchema
>;

export const assetAdvisoriesResponseSchema = z.object({
  asset: z.object({
    id: z.string(),
    ip: z.string(),
    deviceType: z.string().nullable(),
    manufacturer: z.string(),
    product: z.string(),
    version: z.string().nullable(),
    versionStatus: z.string(),
    exposure: exposureSchema,
  }),
  matches: z.array(assetAdvisoryMatchSchema),
});
export type AssetAdvisoriesResponse = z.infer<
  typeof assetAdvisoriesResponseSchema
>;

export const syncRequestResponseSchema = z.object({
  status: z.enum(["queued", "started", "already_running"]),
});
