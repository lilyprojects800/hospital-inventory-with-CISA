import { z } from "zod";
import { rematchAssets } from "@/features/advisories/server/matching";
import {
  type ExposureFilter,
  exposureFilterSchema,
} from "@/features/advisories/types";
import type { Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";
import {
  buildPaginationMeta,
  createPaginatedResponse,
  paginationInputSchema,
} from "@/lib/pagination";
import { buildUpdatedAtFilter, createSortParser } from "@/lib/router-utils";
import { baseProcedure, createTRPCRouter } from "@/trpc/init";
import {
  assetInputSchema,
  assetResponseSchema,
  paginatedAssetResponseSchema,
  resolveVersionStatus,
} from "../types";

const createExposureFilter = (
  exposure: ExposureFilter,
): Prisma.AssetWhereInput => {
  switch (exposure) {
    case "affected":
      return { exposure: "AFFECTED" };
    case "possibly":
      return { exposure: "POSSIBLY_AFFECTED" };
    case "any":
      return { exposure: { not: "NONE" } };
    case "unfixed":
      return { exposure: { not: "NONE" }, remediation: { not: "VENDOR_FIX" } };
    case "none":
      return { exposure: "NONE" };
    default:
      return {};
  }
};

const ADVISORY_PREVIEW_LIMIT = 3;

const createSearchFilter = (search: string) => {
  const insensitive = { contains: search, mode: "insensitive" as const };
  return search
    ? {
        OR: [
          { ip: insensitive },
          { deviceType: insensitive },
          { manufacturer: insensitive },
          { product: insensitive },
          { version: insensitive },
        ],
      }
    : {};
};

/** The sort keys that assets.getMany accepts; it drops any other key. */
export const ASSET_SORT_KEYS = new Set([
  "ip",
  "deviceType",
  "manufacturer",
  "product",
  "version",
  "versionStatus",
  "exposure",
  "maxSeverity",
  "advisoryCount",
  "remediation",
  "createdAt",
  "updatedAt",
] as const);

const ASSET_SORT_DESCRIPTION = `Comma-separated sort fields, with "-" in front of a field for descending. Fields: ${[...ASSET_SORT_KEYS].join(", ")}. Unknown fields are ignored.`;

const parseAssetSort = createSortParser(ASSET_SORT_KEYS, [
  { exposure: "desc" },
  { maxSeverity: "desc" },
  { updatedAt: "desc" },
]);

export const assetsRouter = createTRPCRouter({
  // GET /api/v1/assets - List all assets
  getMany: baseProcedure
    .input(
      paginationInputSchema.extend({
        sort: z.string().default("").describe(ASSET_SORT_DESCRIPTION),
        exposure: exposureFilterSchema,
      }),
    )
    .meta({
      openapi: {
        method: "GET",
        path: "/assets",
        // trpc-to-openapi documents every endpoint as authenticated unless told otherwise
        protect: false,
        tags: ["Assets"],
        summary: "List Assets",
        description:
          "Get a page of assets with their CISA advisory exposure. `search` matches the IP address, device type, manufacturer, product, and version. By default, affected assets come first, most severe first.",
      },
    })
    .output(paginatedAssetResponseSchema)
    .query(async ({ input }) => {
      const where: Prisma.AssetWhereInput = {
        ...createSearchFilter(input.search),
        ...createExposureFilter(input.exposure),
        ...buildUpdatedAtFilter(input),
      };
      const totalCount = await prisma.asset.count({ where });
      const meta = buildPaginationMeta(input, totalCount);
      const items = await prisma.asset.findMany({
        where,
        // id breaks ties, so a row cannot move between pages
        orderBy: [...parseAssetSort(input.sort), { id: "asc" }],
        skip: meta.skip,
        take: meta.take,
        include: {
          matches: {
            orderBy: [{ status: "desc" }, { severity: "desc" }],
            take: ADVISORY_PREVIEW_LIMIT,
            select: {
              status: true,
              severity: true,
              advisory: { select: { id: true, title: true } },
            },
          },
        },
      });
      return createPaginatedResponse(
        items.map(({ matches, ...asset }) => ({
          ...asset,
          advisories: (matches ?? []).map((match) => ({
            advisoryId: match.advisory.id,
            title: match.advisory.title,
            status: match.status,
            severity: match.severity,
          })),
        })),
        meta,
      );
    }),

  // POST /api/v1/assets - Create an asset
  create: baseProcedure
    .input(assetInputSchema)
    .meta({
      openapi: {
        method: "POST",
        path: "/assets",
        // trpc-to-openapi documents every endpoint as authenticated unless told otherwise
        protect: false,
        tags: ["Assets"],
        summary: "Create Asset",
        description:
          "Create a new asset. Give `version` when it is known; otherwise omit it and set `versionStatus` to UNKNOWN (the default) or NOT_APPLICABLE. The asset is matched against stored CISA advisories straight away.",
      },
    })
    .output(assetResponseSchema)
    .mutation(async ({ input }) => {
      const created = await prisma.asset.create({
        data: { ...input, versionStatus: resolveVersionStatus(input) },
      });
      try {
        await rematchAssets([created.id]);
        return (
          (await prisma.asset.findUnique({ where: { id: created.id } })) ??
          created
        );
      } catch (error) {
        console.error("Advisory matching failed for new asset", error);
        return created;
      }
    }),
});
