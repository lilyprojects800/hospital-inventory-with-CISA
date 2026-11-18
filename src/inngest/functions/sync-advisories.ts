import { ADVISORY_SOURCE, ADVISORY_SYNC } from "@/features/advisories/config";
import { rematchAssets } from "@/features/advisories/server/matching";
import {
  chunk,
  findChangedAdvisories,
  type IngestResult,
  ingestAdvisories,
  markSyncFinished,
  markSyncStarted,
  summarizeFailures,
} from "@/features/advisories/server/sync";
import { inngest } from "../client";

export const syncAdvisories = inngest.createFunction(
  {
    id: "sync-cisa-advisories",
    name: "Sync CISA medical advisories",
    concurrency: { limit: 1 },
    retries: 3,
    onFailure: async ({ error }) => {
      await markSyncFinished({ changed: 0, error: error.message });
    },
  },
  [{ cron: ADVISORY_SYNC.cron }, { event: ADVISORY_SYNC.event }],
  async ({ step }) => {
    await step.run("mark-started", () => markSyncStarted());

    const changed = await step.run("find-changed-advisories", () =>
      findChangedAdvisories(),
    );

    const failed: IngestResult["failed"] = [];
    let saved = 0;
    const batches = chunk(changed, ADVISORY_SOURCE.batchSize);
    for (const [index, batch] of batches.entries()) {
      const result = await step.run(`ingest-batch-${index + 1}`, () =>
        ingestAdvisories(batch),
      );
      saved += result.saved.length;
      failed.push(...result.failed);
    }

    const matches = await step.run("match-inventory", () => rematchAssets());

    await step.run("mark-finished", () =>
      markSyncFinished({ changed: saved, error: summarizeFailures(failed) }),
    );

    return { changed: changed.length, saved, failed: failed.length, matches };
  },
);
