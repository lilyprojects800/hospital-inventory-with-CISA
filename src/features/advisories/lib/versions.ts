type Segment =
  | { kind: "number"; value: number }
  | { kind: "text"; value: string }
  | { kind: "wildcard" };

export type Comparison = -1 | 0 | 1 | null;

export type VersionBound = { version: string; inclusive: boolean };

export type VersionInterval = {
  lower: VersionBound | null;
  upper: VersionBound | null;
};

export type VersionSpec =
  | { kind: "all" }
  | { kind: "constraints"; intervals: VersionInterval[] }
  | { kind: "unknown" };

export type VersionEvaluation = "match" | "no_match" | "incomparable";

export function normalizeVersion(raw: string): string {
  return raw
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[()[\]]/g, "")
    .replace(
      /^\s*(?:software\s+|firmware\s+)?(?:versions?|rev(?:ision)?)\b\.?\s*/,
      "",
    )
    .replace(/^v(?=\d)/, "")
    .replace(/[,;:]+$/, "")
    .trim();
}

export function tokenizeVersion(raw: string): Segment[] {
  const tokens = normalizeVersion(raw).match(/[a-z]+|\d+|\*/g) ?? [];
  return tokens.map((token) => {
    if (token === "*" || token === "x") return { kind: "wildcard" };
    if (/^\d+$/.test(token)) return { kind: "number", value: Number(token) };
    return { kind: "text", value: token };
  });
}

export function compareVersions(a: string, b: string): Comparison {
  const left = tokenizeVersion(a);
  const right = tokenizeVersion(b);
  if (left.length === 0 || right.length === 0) return null;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const l = left[i];
    const r = right[i];
    if (l?.kind === "wildcard" || r?.kind === "wildcard") return 0;
    if (!l || !r) {
      const last = right[right.length - 1];
      if (!r && last.kind === "text" && last.value.length === 1) return 0;
      const present = (l ?? r) as Segment;
      if (present.kind === "number" && present.value === 0) continue;
      return l ? 1 : -1;
    }
    if (l.kind === "number" && r.kind === "number") {
      if (l.value !== r.value) return l.value < r.value ? -1 : 1;
      continue;
    }
    if (l.kind === "text" && r.kind === "text") {
      if (l.value === r.value) continue;
      if (l.value.length === 1 && r.value.length === 1) {
        return l.value < r.value ? -1 : 1;
      }
      return null;
    }
    return null;
  }
  return 0;
}

const isUsableVersion = (version: string) => {
  const segments = tokenizeVersion(version);
  if (segments.length === 0) return false;
  return segments.some(
    (segment) =>
      segment.kind === "number" ||
      segment.kind === "wildcard" ||
      (segment.kind === "text" && segment.value.length === 1),
  );
};

const ALL_VERSIONS =
  /^(?:vers:[a-z]+\/)?\*$|^vers:all\b|\ball versions\b|^all$/;

type Constraint = { op: "<" | "<=" | ">" | ">=" | "="; version: string };

function rewritePhrases(part: string): string {
  return part
    .replace(
      /^(.+?)\s+(?:and|or)\s+(?:below|prior|earlier|lower|older|before)\b.*$/,
      "<= $1",
    )
    .replace(
      /^(?:all\s+)?(?:versions?\s+)?(?:prior to|before|earlier than)\s+(.+)$/,
      "< $1",
    )
    .replace(/^(.+?)\s+(?:and|or)\s+(?:later|above|newer|higher)\b.*$/, ">= $1")
    .replace(/^(.+?)\s+(?:through|to)\s+(\S+).*$/, ">= $1 | <= $2");
}

function parseConstraints(raw: string): Constraint[] {
  const revRange = raw.match(
    /^rev(?:ision)?\.?\s*([a-z0-9.]+)\s*-\s*([a-z0-9.]+)\b/,
  );
  if (revRange) {
    return [
      { op: ">=", version: revRange[1] },
      { op: "<=", version: revRange[2] },
    ];
  }
  const part = raw
    .replace(
      /^(?:software\s+|firmware\s+)?(?:versions?|rev(?:ision)?)\b\.?\s*/,
      "",
    )
    .trim();
  const rewritten = rewritePhrases(part);
  if (rewritten !== part) {
    return rewritten
      .split("|")
      .flatMap((piece) => parseConstraints(piece.trim()));
  }
  const match = part.match(/^(<=|>=|<|>|=)?\s*([^\s|]+)/);
  if (!match) return [];
  const version = normalizeVersion(match[2]);
  if (!isUsableVersion(version)) return [];
  return [{ op: (match[1] as Constraint["op"]) ?? "=", version }];
}

export function parseVersionSpec(raw: string | null | undefined): VersionSpec {
  if (!raw) return { kind: "unknown" };
  const text = raw.normalize("NFKD").toLowerCase().replace(/\s+/g, " ").trim();
  if (ALL_VERSIONS.test(text)) return { kind: "all" };
  const body = text.replace(/^vers:[a-z]+\//, "");
  const constraints = body
    .split("|")
    .map((part) => part.replace(/[()[\]]/g, "").trim())
    .filter(Boolean)
    .flatMap(parseConstraints);

  const intervals: VersionInterval[] = [];
  let pendingLower: VersionBound | null = null;
  for (const { op, version } of constraints) {
    if (op === ">" || op === ">=") {
      if (pendingLower) intervals.push({ lower: pendingLower, upper: null });
      pendingLower = { version, inclusive: op === ">=" };
    } else if (op === "<" || op === "<=") {
      intervals.push({
        lower: pendingLower,
        upper: { version, inclusive: op === "<=" },
      });
      pendingLower = null;
    } else {
      intervals.push({
        lower: { version, inclusive: true },
        upper: { version, inclusive: true },
      });
    }
  }
  if (pendingLower) intervals.push({ lower: pendingLower, upper: null });

  if (intervals.length === 0) return { kind: "unknown" };
  return { kind: "constraints", intervals };
}

function checkInterval(
  version: string,
  interval: VersionInterval,
): boolean | null {
  if (interval.lower) {
    const result = compareVersions(version, interval.lower.version);
    if (result === null) return null;
    if (result < 0 || (result === 0 && !interval.lower.inclusive)) return false;
  }
  if (interval.upper) {
    const result = compareVersions(version, interval.upper.version);
    if (result === null) return null;
    if (result > 0 || (result === 0 && !interval.upper.inclusive)) return false;
  }
  return true;
}

export function evaluateVersion(
  spec: VersionSpec,
  version: string,
): VersionEvaluation {
  if (spec.kind === "all") return "match";
  if (spec.kind === "unknown") return "incomparable";
  let comparable = false;
  for (const interval of spec.intervals) {
    const result = checkInterval(version, interval);
    if (result === true) return "match";
    if (result === false) comparable = true;
  }
  return comparable ? "no_match" : "incomparable";
}

export function describeVersionSpec(raw: string | null | undefined): string {
  const spec = parseVersionSpec(raw);
  if (spec.kind === "all") return "all versions";
  return raw?.trim() || "unspecified versions";
}
