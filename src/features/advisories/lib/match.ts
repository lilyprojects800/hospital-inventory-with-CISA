import type { ProductStatusValue, RemediationCategoryValue } from "./csaf";
import { matchProduct } from "./products";
import { evaluateVersion, parseVersionSpec } from "./versions";

export type MatchableAsset = {
  manufacturer: string;
  product: string;
  version: string | null;
  versionStatus: "KNOWN" | "UNKNOWN" | "NOT_APPLICABLE";
};

export type MatchableProduct = {
  productId: string;
  vendor: string;
  productName: string;
  versionSpec: string | null;
  status: ProductStatusValue;
};

export type MatchStatusValue = "AFFECTED" | "POSSIBLY_AFFECTED";

export type RemediationLevelValue =
  | "VENDOR_FIX"
  | "MITIGATION_ONLY"
  | "NO_REMEDIATION";

export type AdvisoryMatch = {
  status: MatchStatusValue;
  reason: string;
  matchedProductIds: string[];
};

type Candidate = {
  status: MatchStatusValue;
  reason: string;
  productId: string;
};

const quote = (value: string) => `"${value}"`;

function versionLabel(spec: string | null) {
  const parsed = parseVersionSpec(spec);
  if (parsed.kind === "all") return "all versions";
  return spec ? `versions ${quote(spec)}` : "unspecified versions";
}

function evaluateCandidate(
  asset: MatchableAsset,
  product: MatchableProduct,
): Candidate | "no_match" | null {
  const productMatch = matchProduct(asset, product);
  if (!productMatch) return null;

  const spec = parseVersionSpec(product.versionSpec);
  const affects = `${product.productName} (${versionLabel(product.versionSpec)})`;
  const investigating = product.status === "UNDER_INVESTIGATION";
  const base = { productId: product.productId };

  let status: MatchStatusValue;
  let reason: string;

  if (spec.kind === "all") {
    status = "AFFECTED";
    reason = `Advisory covers all versions of ${product.productName}.`;
  } else if (asset.versionStatus === "NOT_APPLICABLE" || !asset.version) {
    status = "POSSIBLY_AFFECTED";
    reason =
      asset.versionStatus === "NOT_APPLICABLE"
        ? `Product matches ${affects}, but this device has no version to compare.`
        : `Product matches ${affects}, but this device's version is unknown.`;
  } else {
    const result = evaluateVersion(spec, asset.version);
    if (result === "no_match") return "no_match";
    if (result === "match") {
      status = "AFFECTED";
      reason = `Version ${asset.version} is within ${affects}.`;
    } else {
      status = "POSSIBLY_AFFECTED";
      reason = `Product matches ${affects}, but version ${asset.version} could not be compared automatically.`;
    }
  }

  if (productMatch === "model_unspecified" && status === "AFFECTED") {
    status = "POSSIBLY_AFFECTED";
    reason = `Advisory names a specific model, ${product.productName}; this device's model number is not recorded. ${reason}`;
  }
  if (investigating) {
    status = "POSSIBLY_AFFECTED";
    reason = `Vendor is still investigating. ${reason}`;
  }
  return { ...base, status, reason };
}

export function matchAssetToAdvisory(
  asset: MatchableAsset,
  products: MatchableProduct[],
): AdvisoryMatch | null {
  const candidates: Candidate[] = [];
  const rejectedNames = new Set<string>();
  for (const product of products) {
    if (
      product.status !== "AFFECTED" &&
      product.status !== "UNDER_INVESTIGATION"
    ) {
      continue;
    }
    const result = evaluateCandidate(asset, product);
    if (result === "no_match") rejectedNames.add(product.productName);
    else if (result) candidates.push(result);
  }

  const affected = candidates.filter((c) => c.status === "AFFECTED");
  if (affected.length > 0) {
    return {
      status: "AFFECTED",
      reason: affected[0].reason,
      matchedProductIds: affected.map((c) => c.productId),
    };
  }

  const possible = candidates.filter((c) => {
    if (!asset.version) return true;
    const product = products.find((p) => p.productId === c.productId);
    return !product || !rejectedNames.has(product.productName);
  });
  if (possible.length > 0) {
    return {
      status: "POSSIBLY_AFFECTED",
      reason: possible[0].reason,
      matchedProductIds: possible.map((c) => c.productId),
    };
  }
  return null;
}

export function remediationLevel(
  categories: RemediationCategoryValue[],
): RemediationLevelValue {
  if (categories.some((c) => c === "VENDOR_FIX" || c === "OPTIONAL_PATCH")) {
    return "VENDOR_FIX";
  }
  if (categories.some((c) => c === "MITIGATION" || c === "WORKAROUND")) {
    return "MITIGATION_ONLY";
  }
  return "NO_REMEDIATION";
}

const CATEGORY_ORDER: RemediationCategoryValue[] = [
  "VENDOR_FIX",
  "OPTIONAL_PATCH",
  "FIX_PLANNED",
  "WORKAROUND",
  "MITIGATION",
  "NO_FIX_PLANNED",
  "NONE_AVAILABLE",
];

export function sortRemediations<
  T extends { category: RemediationCategoryValue },
>(remediations: T[]): T[] {
  return [...remediations].sort(
    (a, b) =>
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
  );
}

export function severityLabel(score: number | null | undefined) {
  if (!score) return "None";
  if (score >= 9) return "Critical";
  if (score >= 7) return "High";
  if (score >= 4) return "Medium";
  return "Low";
}

export function relevantToProducts<T extends { productIds: string[] }>(
  items: T[],
  productIds: string[],
): T[] {
  const ids = new Set(productIds);
  return items.filter(
    (item) =>
      item.productIds.length === 0 || item.productIds.some((id) => ids.has(id)),
  );
}
