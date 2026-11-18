// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { asset, rematchAssets } = vi.hoisted(() => ({
  asset: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  rematchAssets: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: { asset } }));
vi.mock("@/features/advisories/server/matching", () => ({ rematchAssets }));

import { createCallerFactory } from "@/trpc/init";
import { appRouter } from "@/trpc/routers/_app";

const caller = createCallerFactory(appRouter)({ req: undefined });

const now = new Date("2026-01-01T00:00:00Z");
const row = {
  id: "asset_1",
  ip: "10.10.1.11",
  deviceType: "Infusion Pump",
  manufacturer: "BD",
  product: "Alaris 8015 PC Unit",
  version: null,
  versionStatus: "UNKNOWN" as const,
  exposure: "NONE" as const,
  maxSeverity: 0,
  advisoryCount: 0,
  remediation: null,
  createdAt: now,
  updatedAt: now,
};

describe("assets.getMany", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a page of assets with pagination metadata", async () => {
    asset.count.mockResolvedValue(25);
    asset.findMany.mockResolvedValue([row]);

    const result = await caller.assets.getMany({ page: 2, pageSize: 10 });

    expect(result).toMatchObject({
      items: [{ ...row, advisories: [] }],
      page: 2,
      pageSize: 10,
      totalCount: 25,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    });
    expect(asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });

  it("drops unknown sort fields", async () => {
    asset.count.mockResolvedValue(0);
    asset.findMany.mockResolvedValue([]);

    await caller.assets.getMany({ sort: "-product,secret" });

    expect(asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ product: "desc" }, { id: "asc" }],
      }),
    );
  });

  it("lists affected assets first, most severe first, by default", async () => {
    asset.count.mockResolvedValue(0);
    asset.findMany.mockResolvedValue([]);

    await caller.assets.getMany({});

    expect(asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { exposure: "desc" },
          { maxSeverity: "desc" },
          { updatedAt: "desc" },
          { id: "asc" },
        ],
      }),
    );
  });

  it.each([
    ["affected", { exposure: "AFFECTED" }],
    ["possibly", { exposure: "POSSIBLY_AFFECTED" }],
    ["any", { exposure: { not: "NONE" } }],
    [
      "unfixed",
      { exposure: { not: "NONE" }, remediation: { not: "VENDOR_FIX" } },
    ],
    ["none", { exposure: "NONE" }],
  ] as const)("filters by %s exposure", async (exposure, where) => {
    asset.count.mockResolvedValue(0);
    asset.findMany.mockResolvedValue([]);

    await caller.assets.getMany({ exposure });

    expect(asset.count).toHaveBeenCalledWith({ where });
    expect(asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where }),
    );
  });

  it("returns a preview of the matched advisories", async () => {
    asset.count.mockResolvedValue(1);
    asset.findMany.mockResolvedValue([
      {
        ...row,
        exposure: "AFFECTED",
        maxSeverity: 8.2,
        advisoryCount: 1,
        remediation: "MITIGATION_ONLY",
        matches: [
          {
            status: "AFFECTED",
            severity: 8.2,
            advisory: { id: "ICSMA-23-194-01", title: "BD Alaris System" },
          },
        ],
      },
    ]);

    const result = await caller.assets.getMany({});

    expect(result.items[0].advisories).toEqual([
      {
        advisoryId: "ICSMA-23-194-01",
        title: "BD Alaris System",
        status: "AFFECTED",
        severity: 8.2,
      },
    ]);
  });
});

describe("assets.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const input = {
    ip: "10.10.1.11",
    deviceType: "Infusion Pump",
    manufacturer: "BD",
    product: "Alaris 8015 PC Unit",
  };

  it("creates an asset with no version as UNKNOWN", async () => {
    asset.create.mockResolvedValue(row);

    await expect(caller.assets.create(input)).resolves.toEqual(row);
    expect(asset.create).toHaveBeenCalledWith({
      data: { ...input, versionStatus: "UNKNOWN" },
    });
  });

  it("marks an asset with a version as KNOWN", async () => {
    asset.create.mockResolvedValue({
      ...row,
      version: "12.1.2",
      versionStatus: "KNOWN",
    });

    await caller.assets.create({ ...input, version: "12.1.2" });
    expect(asset.create).toHaveBeenCalledWith({
      data: { ...input, version: "12.1.2", versionStatus: "KNOWN" },
    });
  });

  it("keeps NOT_APPLICABLE for an asset with no version", async () => {
    asset.create.mockResolvedValue({ ...row, versionStatus: "NOT_APPLICABLE" });

    await caller.assets.create({ ...input, versionStatus: "NOT_APPLICABLE" });
    expect(asset.create).toHaveBeenCalledWith({
      data: { ...input, versionStatus: "NOT_APPLICABLE" },
    });
  });

  it("rejects a version with a status other than KNOWN", async () => {
    await expect(
      caller.assets.create({
        ...input,
        version: "12.1.2",
        versionStatus: "NOT_APPLICABLE",
      }),
    ).rejects.toThrow(/versionStatus must be KNOWN or omitted/);
    expect(asset.create).not.toHaveBeenCalled();
  });

  it("rejects KNOWN without a version", async () => {
    await expect(
      caller.assets.create({ ...input, versionStatus: "KNOWN" }),
    ).rejects.toThrow(/version is required/);
    expect(asset.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid IP address", async () => {
    await expect(
      caller.assets.create({
        ip: "not-an-ip",
        manufacturer: "BD",
        product: "Alaris 8015 PC Unit",
      }),
    ).rejects.toThrow();
    expect(asset.create).not.toHaveBeenCalled();
  });

  it("matches a new asset against advisories and returns its exposure", async () => {
    const matched = {
      ...row,
      version: "12.1.2",
      versionStatus: "KNOWN" as const,
      exposure: "AFFECTED" as const,
      maxSeverity: 8.2,
      advisoryCount: 1,
      remediation: "MITIGATION_ONLY" as const,
    };
    asset.create.mockResolvedValue({ ...row, version: "12.1.2" });
    asset.findUnique.mockResolvedValue(matched);
    rematchAssets.mockResolvedValue({});

    await expect(
      caller.assets.create({ ...input, version: "12.1.2" }),
    ).resolves.toEqual(matched);
    expect(rematchAssets).toHaveBeenCalledWith([row.id]);
  });

  it("still creates the asset when matching fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    asset.create.mockResolvedValue(row);
    rematchAssets.mockRejectedValue(new Error("database unavailable"));

    await expect(caller.assets.create(input)).resolves.toEqual(row);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
