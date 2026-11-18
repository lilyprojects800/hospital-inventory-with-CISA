import { z } from "zod";

const noteSchema = z.object({
  category: z.string().optional(),
  title: z.string().optional(),
  text: z.string().optional(),
});

const referenceSchema = z.object({
  category: z.string().optional(),
  summary: z.string().optional(),
  url: z.string().optional(),
});

type Branch = {
  category?: string;
  name?: string;
  product?: { product_id?: string; name?: string };
  branches?: Branch[];
};

const branchSchema: z.ZodType<Branch> = z.lazy(() =>
  z.object({
    category: z.string().optional(),
    name: z.string().optional(),
    product: z
      .object({
        product_id: z.string().optional(),
        name: z.string().optional(),
      })
      .optional(),
    branches: z.array(branchSchema).optional(),
  }),
);

const scoreSchema = z.object({
  products: z.array(z.string()).optional(),
  cvss_v3: z
    .object({
      baseScore: z.number().optional(),
      baseSeverity: z.string().optional(),
      vectorString: z.string().optional(),
    })
    .optional(),
  cvss_v4: z
    .object({
      baseScore: z.number().optional(),
      baseSeverity: z.string().optional(),
      vectorString: z.string().optional(),
    })
    .optional(),
});

const remediationSchema = z.object({
  category: z.string(),
  details: z.string().optional(),
  url: z.string().optional(),
  product_ids: z.array(z.string()).optional(),
});

const vulnerabilitySchema = z.object({
  cve: z.string().optional(),
  title: z.string().optional(),
  cwe: z.object({ id: z.string(), name: z.string().optional() }).optional(),
  notes: z.array(noteSchema).optional(),
  product_status: z.record(z.string(), z.array(z.string())).optional(),
  remediations: z.array(remediationSchema).optional(),
  scores: z.array(scoreSchema).optional(),
});

export const csafDocumentSchema = z.object({
  document: z.object({
    title: z.string(),
    notes: z.array(noteSchema).optional(),
    references: z.array(referenceSchema).optional(),
    tracking: z.object({
      id: z.string(),
      initial_release_date: z.string(),
      current_release_date: z.string(),
      version: z.string(),
      revision_history: z
        .array(
          z.object({
            number: z.string().optional(),
            summary: z.string().optional(),
            date: z.string().optional(),
            legacy_version: z.string().optional(),
          }),
        )
        .optional(),
    }),
  }),
  product_tree: z
    .object({
      branches: z.array(branchSchema).optional(),
    })
    .optional(),
  vulnerabilities: z.array(vulnerabilitySchema).optional(),
});

export type CsafDocument = z.infer<typeof csafDocumentSchema>;

export type ProductStatusValue =
  | "AFFECTED"
  | "UNDER_INVESTIGATION"
  | "FIXED"
  | "NOT_AFFECTED"
  | "UNLISTED";

export type RemediationCategoryValue =
  | "VENDOR_FIX"
  | "WORKAROUND"
  | "MITIGATION"
  | "NO_FIX_PLANNED"
  | "NONE_AVAILABLE"
  | "OPTIONAL_PATCH"
  | "FIX_PLANNED";

export type ParsedProduct = {
  productId: string;
  vendor: string;
  productName: string;
  fullName: string;
  versionSpec: string | null;
  status: ProductStatusValue;
};

export type ParsedVulnerability = {
  cve: string | null;
  title: string | null;
  cwe: string | null;
  summary: string | null;
  cvssScore: number | null;
  cvssSeverity: string | null;
  cvssVector: string | null;
  productIds: string[];
};

export type ParsedRemediation = {
  category: RemediationCategoryValue;
  details: string;
  url: string | null;
  productIds: string[];
};

export type ParsedAdvisory = {
  id: string;
  title: string;
  url: string;
  summary: string | null;
  revision: string;
  revisionSummary: string | null;
  releasedAt: Date;
  revisedAt: Date;
  severity: number;
  products: ParsedProduct[];
  vulnerabilities: ParsedVulnerability[];
  remediations: ParsedRemediation[];
};

const STATUS_KEYS: Record<string, ProductStatusValue> = {
  known_affected: "AFFECTED",
  first_affected: "AFFECTED",
  last_affected: "AFFECTED",
  under_investigation: "UNDER_INVESTIGATION",
  fixed: "FIXED",
  first_fixed: "FIXED",
  known_not_affected: "NOT_AFFECTED",
};

const STATUS_PRIORITY: ProductStatusValue[] = [
  "AFFECTED",
  "UNDER_INVESTIGATION",
  "FIXED",
  "NOT_AFFECTED",
  "UNLISTED",
];

const REMEDIATION_CATEGORIES: Record<string, RemediationCategoryValue> = {
  vendor_fix: "VENDOR_FIX",
  workaround: "WORKAROUND",
  mitigation: "MITIGATION",
  no_fix_planned: "NO_FIX_PLANNED",
  none_available: "NONE_AVAILABLE",
  optional_patch: "OPTIONAL_PATCH",
  fix_planned: "FIX_PLANNED",
};

const VERSION_CATEGORIES = new Set([
  "product_version",
  "product_version_range",
]);
const NAME_CATEGORIES = new Set(["product_name", "product_family"]);

const clean = (value: string | undefined | null) => {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : null;
};

type BranchContext = {
  vendor: string | null;
  productName: string | null;
  versionSpec: string | null;
};

function collectProducts(
  branches: Branch[] | undefined,
  context: BranchContext,
  out: Omit<ParsedProduct, "status">[],
) {
  for (const branch of branches ?? []) {
    const name = clean(branch.name);
    const next = { ...context };
    if (branch.category === "vendor") next.vendor = name;
    if (branch.category && NAME_CATEGORIES.has(branch.category)) {
      next.productName = next.productName
        ? `${next.productName} ${name}`
        : name;
    }
    if (branch.category && VERSION_CATEGORIES.has(branch.category)) {
      next.versionSpec = name;
    }
    const productId = branch.product?.product_id;
    if (productId && next.vendor) {
      const fullName = clean(branch.product?.name) ?? next.productName ?? "";
      out.push({
        productId,
        vendor: next.vendor,
        productName: next.productName ?? fullName,
        fullName,
        versionSpec: next.versionSpec,
      });
    }
    collectProducts(branch.branches, next, out);
  }
}

function resolveStatuses(doc: CsafDocument) {
  const statuses = new Map<string, ProductStatusValue>();
  for (const vulnerability of doc.vulnerabilities ?? []) {
    for (const [key, ids] of Object.entries(
      vulnerability.product_status ?? {},
    )) {
      const status = STATUS_KEYS[key];
      if (!status) continue;
      for (const id of ids) {
        const current = statuses.get(id);
        if (
          !current ||
          STATUS_PRIORITY.indexOf(status) < STATUS_PRIORITY.indexOf(current)
        ) {
          statuses.set(id, status);
        }
      }
    }
  }
  return statuses;
}

function pickScore(scores: z.infer<typeof scoreSchema>[] | undefined) {
  let best: {
    score: number;
    severity: string | null;
    vector: string | null;
  } | null = null;
  for (const score of scores ?? []) {
    const cvss = score.cvss_v4 ?? score.cvss_v3;
    if (cvss?.baseScore === undefined) continue;
    if (!best || cvss.baseScore > best.score) {
      best = {
        score: cvss.baseScore,
        severity: clean(cvss.baseSeverity),
        vector: clean(cvss.vectorString),
      };
    }
  }
  return best;
}

function affectedIds(
  productStatus: Record<string, string[]> | undefined,
): string[] {
  const ids = new Set<string>();
  for (const [key, list] of Object.entries(productStatus ?? {})) {
    const status = STATUS_KEYS[key];
    if (status === "AFFECTED" || status === "UNDER_INVESTIGATION") {
      for (const id of list) ids.add(id);
    }
  }
  return [...ids];
}

export function advisoryWebUrl(id: string) {
  return `https://www.cisa.gov/news-events/ics-medical-advisories/${id.toLowerCase()}`;
}

export function parseCsaf(input: unknown): ParsedAdvisory {
  const doc = csafDocumentSchema.parse(input);
  const { document } = doc;

  const rawProducts: Omit<ParsedProduct, "status">[] = [];
  collectProducts(
    doc.product_tree?.branches,
    { vendor: null, productName: null, versionSpec: null },
    rawProducts,
  );
  const statuses = resolveStatuses(doc);
  const seen = new Set<string>();
  const products: ParsedProduct[] = [];
  for (const product of rawProducts) {
    if (seen.has(product.productId)) continue;
    seen.add(product.productId);
    products.push({
      ...product,
      status: statuses.get(product.productId) ?? "UNLISTED",
    });
  }

  const vulnerabilities: ParsedVulnerability[] = (
    doc.vulnerabilities ?? []
  ).map((vulnerability) => {
    const score = pickScore(vulnerability.scores);
    const summary = vulnerability.notes?.find(
      (note) => note.category === "summary" || note.category === "description",
    );
    return {
      cve: clean(vulnerability.cve),
      title: clean(vulnerability.title),
      cwe: vulnerability.cwe
        ? [vulnerability.cwe.id, vulnerability.cwe.name]
            .filter(Boolean)
            .join(": ")
        : null,
      summary: clean(summary?.text),
      cvssScore: score?.score ?? null,
      cvssSeverity: score?.severity ?? null,
      cvssVector: score?.vector ?? null,
      productIds: affectedIds(vulnerability.product_status),
    };
  });

  const remediationKeys = new Map<string, ParsedRemediation>();
  for (const vulnerability of doc.vulnerabilities ?? []) {
    for (const remediation of vulnerability.remediations ?? []) {
      const category = REMEDIATION_CATEGORIES[remediation.category];
      const details = clean(remediation.details);
      if (!category || !details) continue;
      const url = clean(remediation.url);
      const key = `${category}|${details}|${url ?? ""}`;
      const existing = remediationKeys.get(key);
      const ids = remediation.product_ids ?? [];
      if (existing) {
        existing.productIds = [...new Set([...existing.productIds, ...ids])];
      } else {
        remediationKeys.set(key, {
          category,
          details,
          url,
          productIds: [...new Set(ids)],
        });
      }
    }
  }

  const summaryNote = document.notes?.find(
    (note) => note.category === "summary",
  );
  const webReference = document.references?.find(
    (reference) =>
      reference.category === "self" &&
      reference.url?.includes("cisa.gov") &&
      !reference.url.endsWith(".json"),
  );
  const history = document.tracking.revision_history ?? [];
  const latest = history[history.length - 1];

  return {
    id: document.tracking.id.trim().toUpperCase(),
    title: document.title.trim(),
    url: webReference?.url ?? advisoryWebUrl(document.tracking.id),
    summary: clean(summaryNote?.text),
    revision: latest?.legacy_version ?? document.tracking.version,
    revisionSummary: clean(latest?.summary),
    releasedAt: new Date(document.tracking.initial_release_date),
    revisedAt: new Date(document.tracking.current_release_date),
    severity: Math.max(0, ...vulnerabilities.map((v) => v.cvssScore ?? 0)),
    products,
    vulnerabilities,
    remediations: [...remediationKeys.values()],
  };
}
