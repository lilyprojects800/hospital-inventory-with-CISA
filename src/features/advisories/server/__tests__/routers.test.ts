import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, send, after, runAdvisorySync } = vi.hoisted(() => ({
  db: {
    asset: { count: vi.fn(), findUnique: vi.fn() },
    advisory: { count: vi.fn() },
    assetAdvisoryMatch: { groupBy: vi.fn() },
    syncState: { findUnique: vi.fn() },
  },
  send: vi.fn(),
  after: vi.fn(),
  runAdvisorySync: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: db }));
vi.mock("@/inngest/client", () => ({ inngest: { send } }));
vi.mock("next/server", () => ({ after }));
vi.mock("../sync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../sync")>()),
  runAdvisorySync,
}));

import { createCallerFactory } from "@/trpc/init";
import { appRouter } from "@/trpc/routers/_app";

const caller = createCallerFactory(appRouter)({ req: undefined });

const day = (d: number) => new Date(Date.UTC(2025, 0, d));

const advisory = (id: string, overrides: object = {}) => ({
  id,
  title: `Advisory ${id}`,
  url: `https://www.cisa.gov/${id}`,
  csafUrl: `https://example.test/${id}.json`,
  summary: null,
  revision: "Initial",
  revisionSummary: null,
  releasedAt: day(1),
  revisedAt: day(1),
  products: [
    {
      productId: "P1",
      productName: "Life2000 Ventilation System",
      versionSpec: "<=06.08.00.00",
    },
    { productId: "P2", productName: "Other product", versionSpec: null },
  ],
  vulnerabilities: [
    {
      id: "v1",
      advisoryId: id,
      cve: "CVE-1",
      title: null,
      cwe: null,
      summary: null,
      cvssScore: 5,
      cvssSeverity: "MEDIUM",
      cvssVector: null,
      productIds: ["P1"],
    },
    {
      id: "v2",
      advisoryId: id,
      cve: "CVE-2",
      title: null,
      cwe: null,
      summary: null,
      cvssScore: 9.8,
      cvssSeverity: "CRITICAL",
      cvssVector: null,
      productIds: ["P2"],
    },
  ],
  remediations: [
    {
      category: "MITIGATION",
      details: "Isolate",
      url: null,
      productIds: ["P1"],
    },
    {
      category: "VENDOR_FIX",
      details: "Update",
      url: null,
      productIds: ["P1"],
    },
    {
      category: "VENDOR_FIX",
      details: "Other fix",
      url: null,
      productIds: ["P2"],
    },
  ],
  ...overrides,
});

const match = (
  advisoryId: string,
  status: "AFFECTED" | "POSSIBLY_AFFECTED",
  severity: number,
) => ({
  status,
  reason: "because",
  severity,
  remediation: "VENDOR_FIX",
  firstDetectedAt: day(2),
  matchedProductIds: ["P1"],
  advisory: advisory(advisoryId),
});

describe("advisories.forAsset", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only what applies to the matched products, most urgent first", async () => {
    db.asset.findUnique.mockResolvedValue({
      id: "asset_1",
      ip: "10.10.3.55",
      deviceType: "Ventilator",
      manufacturer: "Baxter",
      product: "Life2000 Ventilator",
      version: "06.07.00.00",
      versionStatus: "KNOWN",
      exposure: "AFFECTED",
      matches: [
        match("ICSMA-1", "POSSIBLY_AFFECTED", 9),
        match("ICSMA-2", "AFFECTED", 5),
        match("ICSMA-3", "AFFECTED", 7),
      ],
    });

    const result = await caller.advisories.forAsset({ assetId: "asset_1" });

    expect(result.matches.map((m) => m.advisory.id)).toEqual([
      "ICSMA-3",
      "ICSMA-2",
      "ICSMA-1",
    ]);
    const [first] = result.matches;
    expect(first.remediations).toEqual([
      { category: "VENDOR_FIX", details: "Update", url: null },
      { category: "MITIGATION", details: "Isolate", url: null },
    ]);
    expect(first.vulnerabilities.map((v) => v.cve)).toEqual(["CVE-1"]);
    expect(first.affectedProducts).toEqual([
      { name: "Life2000 Ventilation System", versionSpec: "<=06.08.00.00" },
    ]);
  });

  it("returns NOT_FOUND for an unknown asset", async () => {
    db.asset.findUnique.mockResolvedValue(null);
    await expect(
      caller.advisories.forAsset({ assetId: "missing" }),
    ).rejects.toThrow(/Asset not found/);
  });
});

describe("advisories.summary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("counts exposed assets and reports sync state", async () => {
    db.asset.count
      .mockResolvedValueOnce(29)
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(6);
    db.advisory.count.mockResolvedValue(191);
    db.assetAdvisoryMatch.groupBy.mockResolvedValue([
      { advisoryId: "a" },
      { advisoryId: "b" },
    ]);
    db.syncState.findUnique.mockResolvedValue({
      running: true,
      lastStartedAt: day(1),
      lastFinishedAt: null,
      lastSuccessAt: null,
      lastError: null,
      lastChanged: 0,
    });

    const result = await caller.advisories.summary();

    expect(result).toMatchObject({
      totalAssets: 29,
      affectedAssets: 12,
      possiblyAffectedAssets: 3,
      unfixedAssets: 6,
      advisoriesTracked: 191,
      advisoriesMatched: 2,
    });
    expect(result.sync.running).toBe(false);
  });
});

describe("advisories.sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.syncState.findUnique.mockResolvedValue(null);
  });

  it("queues a sync through Inngest", async () => {
    send.mockResolvedValue({ ids: ["1"] });
    await expect(caller.advisories.sync()).resolves.toEqual({
      status: "queued",
    });
    expect(send).toHaveBeenCalledWith({
      name: "cisa/advisories.sync.requested",
      data: {},
    });
    expect(after).not.toHaveBeenCalled();
  });

  it("falls back to a background sync when Inngest is unavailable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    send.mockRejectedValue(new Error("connect ECONNREFUSED"));
    runAdvisorySync.mockResolvedValue({});

    await expect(caller.advisories.sync()).resolves.toEqual({
      status: "started",
    });
    expect(after).toHaveBeenCalledTimes(1);
    await after.mock.calls[0][0]();
    expect(runAdvisorySync).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("does not start a second sync while one is running", async () => {
    db.syncState.findUnique.mockResolvedValue({
      running: true,
      lastStartedAt: new Date(),
    });
    await expect(caller.advisories.sync()).resolves.toEqual({
      status: "already_running",
    });
    expect(send).not.toHaveBeenCalled();
  });
});
