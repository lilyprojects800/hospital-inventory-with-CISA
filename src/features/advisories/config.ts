export const ADVISORY_SOURCE = {
  baseUrl:
    process.env.CISA_CSAF_BASE_URL ??
    "https://raw.githubusercontent.com/cisagov/CSAF/develop/csaf_files/OT/white",
  changesFile: "changes.csv",
  filePattern: /(^|\/)icsma-[^/]+\.json$/i,
  requestTimeoutMs: 20_000,
  fetchConcurrency: 6,
  batchSize: 25,
};

export const ADVISORY_SYNC = {
  stateId: "cisa-csaf",
  cron: "TZ=UTC 15 * * * *",
  event: "cisa/advisories.sync.requested",
  staleAfterMs: 15 * 60 * 1000,
};
