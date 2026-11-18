import { TRPCError } from "@trpc/server";
import { after } from "next/server";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import prisma from "@/lib/db";
import { baseProcedure, createTRPCRouter } from "@/trpc/init";
import { ADVISORY_SYNC } from "../config";
import { relevantToProducts, sortRemediations } from "../lib/match";
import {
  advisorySummarySchema,
  assetAdvisoriesResponseSchema,
  syncRequestResponseSchema,
} from "../types";
import { getSyncState, isSyncRunning, runAdvisorySync } from "./sync";

const SEVERITY_ORDER = { AFFECTED: 0, POSSIBLY_AFFECTED: 1 } as const;

export const advisoriesRouter = createTRPCRouter({
  summary: baseProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/advisories/summary",
        protect: false,
        tags: ["Advisories"],
        summary: "Advisory Summary",
        description:
          "Counts of assets affected by CISA medical advisories, and the state of the last advisory sync.",
      },
    })
    .input(z.void())
    .output(advisorySummarySchema)
    .query(async () => {
      const [
        totalAssets,
        affectedAssets,
        possiblyAffectedAssets,
        unfixedAssets,
        advisoriesTracked,
        matchedAdvisories,
        state,
      ] = await Promise.all([
        prisma.asset.count(),
        prisma.asset.count({ where: { exposure: "AFFECTED" } }),
        prisma.asset.count({ where: { exposure: "POSSIBLY_AFFECTED" } }),
        prisma.asset.count({
          where: {
            exposure: { not: "NONE" },
            remediation: { not: "VENDOR_FIX" },
          },
        }),
        prisma.advisory.count(),
        prisma.assetAdvisoryMatch.groupBy({ by: ["advisoryId"] }),
        getSyncState(),
      ]);
      return {
        totalAssets,
        affectedAssets,
        possiblyAffectedAssets,
        unfixedAssets,
        advisoriesTracked,
        advisoriesMatched: matchedAdvisories.length,
        sync: {
          running: isSyncRunning(state),
          lastStartedAt: state?.lastStartedAt ?? null,
          lastFinishedAt: state?.lastFinishedAt ?? null,
          lastSuccessAt: state?.lastSuccessAt ?? null,
          lastError: state?.lastError ?? null,
          lastChanged: state?.lastChanged ?? 0,
        },
      };
    }),

  forAsset: baseProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/assets/{assetId}/advisories",
        protect: false,
        tags: ["Advisories"],
        summary: "Advisories for an Asset",
        description:
          "The CISA advisories matched to an asset, with why each one matched and the remediations that apply to the matched products.",
      },
    })
    .input(z.object({ assetId: z.string().min(1) }))
    .output(assetAdvisoriesResponseSchema)
    .query(async ({ input }) => {
      const asset = await prisma.asset.findUnique({
        where: { id: input.assetId },
        include: {
          matches: {
            include: {
              advisory: {
                include: {
                  products: true,
                  vulnerabilities: true,
                  remediations: true,
                },
              },
            },
          },
        },
      });
      if (!asset) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Asset not found" });
      }

      const matches = asset.matches
        .map((match) => {
          const { advisory } = match;
          const matched = new Set(match.matchedProductIds);
          const affectedProducts = advisory.products
            .filter((product) => matched.has(product.productId))
            .map((product) => ({
              name: product.productName,
              versionSpec: product.versionSpec,
            }));
          const remediations = sortRemediations(
            relevantToProducts(advisory.remediations, match.matchedProductIds),
          ).map(({ category, details, url }) => ({ category, details, url }));
          const vulnerabilities = relevantToProducts(
            advisory.vulnerabilities,
            match.matchedProductIds,
          )
            .sort((a, b) => (b.cvssScore ?? 0) - (a.cvssScore ?? 0))
            .map(({ advisoryId: _a, id: _i, productIds: _p, ...rest }) => rest);
          return {
            status: match.status,
            reason: match.reason,
            severity: match.severity,
            remediation: match.remediation,
            firstDetectedAt: match.firstDetectedAt,
            advisory: {
              id: advisory.id,
              title: advisory.title,
              url: advisory.url,
              csafUrl: advisory.csafUrl,
              summary: advisory.summary,
              revision: advisory.revision,
              revisionSummary: advisory.revisionSummary,
              releasedAt: advisory.releasedAt,
              revisedAt: advisory.revisedAt,
            },
            affectedProducts,
            remediations,
            vulnerabilities,
          };
        })
        .sort(
          (a, b) =>
            SEVERITY_ORDER[a.status] - SEVERITY_ORDER[b.status] ||
            b.severity - a.severity ||
            b.advisory.revisedAt.getTime() - a.advisory.revisedAt.getTime(),
        );

      return {
        asset: {
          id: asset.id,
          ip: asset.ip,
          deviceType: asset.deviceType,
          manufacturer: asset.manufacturer,
          product: asset.product,
          version: asset.version,
          versionStatus: asset.versionStatus,
          exposure: asset.exposure,
        },
        matches,
      };
    }),

  sync: baseProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/advisories/sync",
        protect: false,
        tags: ["Advisories"],
        summary: "Sync Advisories",
        description:
          "Fetch new and updated CISA medical advisories now and re-match them against the inventory. This also runs automatically every hour.",
      },
    })
    .input(z.void())
    .output(syncRequestResponseSchema)
    .mutation(async () => {
      if (isSyncRunning(await getSyncState())) {
        return { status: "already_running" as const };
      }
      try {
        await inngest.send({ name: ADVISORY_SYNC.event, data: {} });
        return { status: "queued" as const };
      } catch (error) {
        console.warn(
          "Inngest is unavailable, syncing advisories in the background instead",
          error,
        );
        after(() =>
          runAdvisorySync().catch((syncError) =>
            console.error("Advisory sync failed", syncError),
          ),
        );
        return { status: "started" as const };
      }
    }),
});
