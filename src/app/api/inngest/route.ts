// Optional: see src/inngest/client.ts.
import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { syncAdvisories } from "@/inngest/functions/sync-advisories";

export const maxDuration = 60;

export const { GET, POST, PUT } = serve({
  client: inngest,
  // Every function in src/inngest/functions/ must be added here, or it will never run.
  functions: [syncAdvisories],
});
