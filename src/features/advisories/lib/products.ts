const VENDOR_NOISE = new Set([
  "inc",
  "incorporated",
  "corp",
  "corporation",
  "company",
  "co",
  "ltd",
  "limited",
  "llc",
  "ag",
  "gmbh",
  "oy",
  "sa",
  "plc",
  "the",
  "international",
  "healthcare",
  "health",
  "healthineers",
  "medical",
  "diagnostics",
  "laboratories",
  "labs",
  "technologies",
  "technology",
  "systems",
  "operating",
  "as",
]);

const VENDOR_ALIASES: Record<string, string> = {
  "becton dickinson": "bd",
  "becton dickinson and": "bd",
  "general electric": "ge",
  phillips: "philips",
  "royal philips": "philips",
  "hill rom": "hillrom",
};

const GENERIC_PRODUCT_WORDS = new Set([
  "a",
  "all",
  "an",
  "and",
  "certain",
  "device",
  "devices",
  "family",
  "firmware",
  "for",
  "in",
  "including",
  "model",
  "models",
  "monitor",
  "monitors",
  "of",
  "on",
  "patient",
  "product",
  "products",
  "series",
  "software",
  "system",
  "systems",
  "the",
  "to",
  "unit",
  "units",
  "ventilation",
  "ventilator",
  "ventilators",
  "version",
  "versions",
  "with",
]);

export function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const words = (value: string) =>
  normalizeText(value).split(" ").filter(Boolean);

function coreVendorName(value: string): string {
  const core = words(value)
    .filter((word) => !VENDOR_NOISE.has(word))
    .join(" ");
  return VENDOR_ALIASES[core] ?? core;
}

export function vendorKeys(vendor: string): string[] {
  const keys = new Set<string>();
  const parenthetical = [...vendor.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]);
  const main = vendor.replace(/\([^)]*\)/g, " ");
  const candidates = [main, ...parenthetical];
  for (const candidate of candidates) {
    keys.add(coreVendorName(candidate));
    for (const part of candidate.split(/,|\/|\band\b/i)) {
      keys.add(coreVendorName(part));
    }
  }
  keys.delete("");
  return [...keys];
}

const startsWithWords = (long: string, short: string) =>
  long === short || long.startsWith(`${short} `);

export function vendorsMatch(assetVendor: string, advisoryVendor: string) {
  const assetKeys = vendorKeys(assetVendor);
  const advisoryKeys = vendorKeys(advisoryVendor);
  return assetKeys.some((a) =>
    advisoryKeys.some((b) => startsWithWords(a, b) || startsWithWords(b, a)),
  );
}

type ModelRange = { prefix: string; low: number; high: number };

type ProductTokens = {
  models: Set<string>;
  names: Set<string>;
  ranges: ModelRange[];
};

function vendorWords(vendor: string) {
  const out = new Set(words(vendor));
  for (const key of vendorKeys(vendor)) {
    for (const word of key.split(" ")) out.add(word);
  }
  return out;
}

export function productTokens(
  product: string,
  vendors: string[] = [],
): ProductTokens {
  const exclude = new Set<string>();
  for (const vendor of vendors) {
    for (const word of vendorWords(vendor)) exclude.add(word);
  }
  const ranges: ModelRange[] = [];
  for (const match of product
    .toLowerCase()
    .matchAll(/\b([a-z]+)(\d+)\s*-\s*(?:\1)?(\d+)\b/g)) {
    const low = Number(match[2]);
    const high = Number(match[3]);
    if (high > low) ranges.push({ prefix: match[1], low, high });
  }
  const models = new Set<string>();
  const names = new Set<string>();
  for (const word of words(product)) {
    if (exclude.has(word) || GENERIC_PRODUCT_WORDS.has(word)) continue;
    if (/\d/.test(word)) models.add(word);
    else names.add(word);
  }
  return { models, names, ranges };
}

const inRange = (model: string, ranges: ModelRange[]) => {
  const match = model.match(/^([a-z]+)(\d+)$/);
  if (!match) return false;
  const value = Number(match[2]);
  return ranges.some(
    (range) =>
      range.prefix === match[1] && value >= range.low && value <= range.high,
  );
};

const intersects = (a: Set<string>, b: Set<string>) =>
  [...a].some((value) => b.has(value));

const isSubset = (a: Set<string>, b: Set<string>) =>
  [...a].every((value) => b.has(value));

const sameSet = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && isSubset(a, b);

export type ProductMatch = "exact" | "model_unspecified" | null;

export function matchProduct(
  asset: { manufacturer: string; product: string },
  advisory: { vendor: string; productName: string },
): ProductMatch {
  if (!vendorsMatch(asset.manufacturer, advisory.vendor)) return null;
  const vendors = [asset.manufacturer, advisory.vendor];
  const a = productTokens(asset.product, vendors);
  const p = productTokens(advisory.productName, vendors);

  const advisoryHasModels = p.models.size > 0 || p.ranges.length > 0;
  if (advisoryHasModels) {
    if (a.models.size > 0) {
      const sharedModel =
        intersects(a.models, p.models) ||
        [...a.models].some((model) => inRange(model, p.ranges));
      if (!sharedModel) return null;
      if (a.names.size === 0 || p.names.size === 0) return "exact";
      return intersects(a.names, p.names) ? "exact" : null;
    }
    if (p.names.size > 0 && sameSet(a.names, p.names)) {
      return "model_unspecified";
    }
    return null;
  }
  if (p.names.size > 0 && isSubset(p.names, a.names)) return "exact";
  return null;
}
