import type { Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";
import { ADVISORY_SOURCE, ADVISORY_SYNC } from "../config";
import { type ParsedAdvisory, parseCsaf } from "../lib/csaf";
import { rematchAssets } from "./matching";
import {
  advisoryFileUrl,
  type ChangeEntry,
  fetchAdvisoryDocument,
  fetchChangeIndex,
} from "./source";

export type IngestResult = {
  saved: string[];
  failed: { path: string; error: string }[];
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export async function saveAdvisory(
  parsed: ParsedAdvisory,
  source: { path: string; updatedAt: Date; raw: unknown },
) {
  const data = {
    title: parsed.title,
    url: parsed.url,
    csafUrl: advisoryFileUrl(source.path),
    csafPath: source.path,
    severity: parsed.severity,
    summary: parsed.summary,
    revision: parsed.revision,
    revisionSummary: parsed.revisionSummary,
    releasedAt: parsed.releasedAt,
    revisedAt: parsed.revisedAt,
    sourceUpdatedAt: source.updatedAt,
    raw: source.raw as Prisma.InputJsonValue,
  };
  await prisma.$transaction([
    prisma.advisory.deleteMany({
      where: { csafPath: source.path, NOT: { id: parsed.id } },
    }),
    prisma.advisory.upsert({
      where: { id: parsed.id },
      create: { id: parsed.id, ...data },
      update: data,
    }),
    prisma.advisoryProduct.deleteMany({ where: { advisoryId: parsed.id } }),
    prisma.vulnerability.deleteMany({ where: { advisoryId: parsed.id } }),
    prisma.remediation.deleteMany({ where: { advisoryId: parsed.id } }),
    prisma.advisoryProduct.createMany({
      data: parsed.products.map((product) => ({
        ...product,
        advisoryId: parsed.id,
      })),
    }),
    prisma.vulnerability.createMany({
      data: parsed.vulnerabilities.map((vulnerability) => ({
        ...vulnerability,
        advisoryId: parsed.id,
      })),
    }),
    prisma.remediation.createMany({
      data: parsed.remediations.map((remediation) => ({
        ...remediation,
        advisoryId: parsed.id,
      })),
    }),
  ]);
}

export async function findChangedAdvisories(): Promise<ChangeEntry[]> {
  const [entries, stored] = await Promise.all([
    fetchChangeIndex(),
    prisma.advisory.findMany({
      select: { csafPath: true, sourceUpdatedAt: true },
    }),
  ]);
  const storedAt = new Map(
    stored.map((row) => [row.csafPath, row.sourceUpdatedAt.getTime()]),
  );
  return entries
    .filter((entry) => {
      const previous = storedAt.get(entry.path);
      return previous === undefined || Date.parse(entry.updatedAt) > previous;
    })
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

async function ingestOne(entry: ChangeEntry) {
  const raw = await fetchAdvisoryDocument(entry.path);
  const parsed = parseCsaf(raw);
  await saveAdvisory(parsed, {
    path: entry.path,
    updatedAt: new Date(entry.updatedAt),
    raw,
  });
  return parsed.id;
}

export async function ingestAdvisories(
  entries: ChangeEntry[],
): Promise<IngestResult> {
  const result: IngestResult = { saved: [], failed: [] };
  const queue = [...entries];
  const worker = async () => {
    for (let entry = queue.shift(); entry; entry = queue.shift()) {
      try {
        result.saved.push(await ingestOne(entry));
      } catch (error) {
        result.failed.push({ path: entry.path, error: errorMessage(error) });
      }
    }
  };
  await Promise.all(
    Array.from({ length: ADVISORY_SOURCE.fetchConcurrency }, worker),
  );
  return result;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function getSyncState() {
  return prisma.syncState.findUnique({ where: { id: ADVISORY_SYNC.stateId } });
}

export function isSyncRunning(
  state: Awaited<ReturnType<typeof getSyncState>>,
  now = Date.now(),
) {
  return Boolean(
    state?.running &&
      state.lastStartedAt &&
      now - state.lastStartedAt.getTime() < ADVISORY_SYNC.staleAfterMs,
  );
}

export async function markSyncStarted() {
  const now = new Date();
  await prisma.syncState.upsert({
    where: { id: ADVISORY_SYNC.stateId },
    create: { id: ADVISORY_SYNC.stateId, running: true, lastStartedAt: now },
    update: { running: true, lastStartedAt: now },
  });
}

export async function markSyncFinished(outcome: {
  changed: number;
  error: string | null;
}) {
  const now = new Date();
  const data = {
    running: false,
    lastFinishedAt: now,
    lastError: outcome.error,
    lastChanged: outcome.changed,
    ...(outcome.error ? {} : { lastSuccessAt: now }),
  };
  await prisma.syncState.upsert({
    where: { id: ADVISORY_SYNC.stateId },
    create: { id: ADVISORY_SYNC.stateId, ...data },
    update: data,
  });
}

export function summarizeFailures(failed: IngestResult["failed"]) {
  if (failed.length === 0) return null;
  const sample = failed
    .slice(0, 3)
    .map((f) => `${f.path}: ${f.error}`)
    .join("; ");
  return `${failed.length} advisories failed to import (${sample})`;
}

export async function runAdvisorySync() {
  await markSyncStarted();
  try {
    const changed = await findChangedAdvisories();
    const failed: IngestResult["failed"] = [];
    let saved = 0;
    for (const batch of chunk(changed, ADVISORY_SOURCE.batchSize)) {
      const result = await ingestAdvisories(batch);
      saved += result.saved.length;
      failed.push(...result.failed);
    }
    const matches = await rematchAssets();
    await markSyncFinished({
      changed: saved,
      error: summarizeFailures(failed),
    });
    return { changed: changed.length, saved, failed, matches };
  } catch (error) {
    await markSyncFinished({ changed: 0, error: errorMessage(error) });
    throw error;
  }
}
