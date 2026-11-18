import { ADVISORY_SOURCE } from "../config";

export type ChangeEntry = { path: string; updatedAt: string };

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(ADVISORY_SOURCE.requestTimeoutMs),
    headers: { Accept: "application/json, text/plain, */*" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`GET ${url} failed with ${response.status}`);
  }
  return response.text();
}

export function advisoryFileUrl(path: string) {
  return `${ADVISORY_SOURCE.baseUrl}/${path}`;
}

export function parseChangesCsv(csv: string): ChangeEntry[] {
  const latest = new Map<string, string>();
  for (const line of csv.split(/\r?\n/)) {
    const match = line.match(/^"?([^",]+)"?\s*,\s*"?([^",]+)"?\s*$/);
    if (!match) continue;
    const [, path, updatedAt] = match;
    if (!ADVISORY_SOURCE.filePattern.test(path)) continue;
    if (Number.isNaN(Date.parse(updatedAt))) continue;
    const previous = latest.get(path);
    if (!previous || Date.parse(updatedAt) > Date.parse(previous)) {
      latest.set(path, updatedAt);
    }
  }
  return [...latest].map(([path, updatedAt]) => ({ path, updatedAt }));
}

export async function fetchChangeIndex(): Promise<ChangeEntry[]> {
  const csv = await fetchText(advisoryFileUrl(ADVISORY_SOURCE.changesFile));
  return parseChangesCsv(csv);
}

export async function fetchAdvisoryDocument(path: string): Promise<unknown> {
  return JSON.parse(await fetchText(advisoryFileUrl(path)));
}
