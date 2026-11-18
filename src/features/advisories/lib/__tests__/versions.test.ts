import { describe, expect, it } from "vitest";
import {
  compareVersions,
  evaluateVersion,
  normalizeVersion,
  parseVersionSpec,
} from "../versions";

const evaluate = (spec: string, version: string) =>
  evaluateVersion(parseVersionSpec(spec), version);

describe("compareVersions", () => {
  it("compares numeric segments numerically", () => {
    expect(compareVersions("9.33", "12.1.2")).toBe(-1);
    expect(compareVersions("12.1.2", "12.1.3")).toBe(-1);
    expect(compareVersions("06.07.00.00", "06.08.00.00")).toBe(-1);
    expect(compareVersions("06.08.00.00", "06.08.00.00")).toBe(0);
  });

  it("treats trailing zeros as equal", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("9.33", "9.33.1")).toBe(-1);
  });

  it("compares single-letter revisions", () => {
    expect(compareVersions("M.00.03", "N")).toBe(-1);
    expect(compareVersions("M.00.03", "M")).toBe(0);
    expect(compareVersions("L.01.18", "J")).toBe(1);
  });

  it("refuses to compare different version schemes", () => {
    expect(
      compareVersions("CMS7.820.120.01/0.93(0.95)", "smart3250-2.6.27"),
    ).toBeNull();
    expect(compareVersions("1.2", "beta")).toBeNull();
  });

  it("treats x as a wildcard", () => {
    expect(compareVersions("8.00.01", "8.x")).toBe(0);
    expect(compareVersions("6.2", "8.x")).toBe(-1);
  });

  it("ignores parentheses so CISA's flattened strings line up", () => {
    expect(normalizeVersion("CMS7.820.120.01/0.93(0.95)")).toBe(
      normalizeVersion("CMS7.820.120.01/0.930.95"),
    );
  });
});

describe("parseVersionSpec", () => {
  it("recognises all-version specs", () => {
    expect(parseVersionSpec("vers:all/*").kind).toBe("all");
    expect(parseVersionSpec("All versions").kind).toBe("all");
  });

  it("returns unknown for free text it cannot read", () => {
    expect(parseVersionSpec("<  july 1 2017").kind).toBe("unknown");
    expect(parseVersionSpec(null).kind).toBe("unknown");
  });
});

describe("evaluateVersion", () => {
  it("handles upper bounds", () => {
    expect(evaluate("<=06.08.00.00", "06.07.00.00")).toBe("match");
    expect(evaluate("<=06.08.00.00", "06.08.00.00")).toBe("match");
    expect(evaluate("<=06.08.00.00", "06.09.00.00")).toBe("no_match");
    expect(evaluate("< B.06.18", "B.06.18")).toBe("no_match");
  });

  it("handles ranges with lower and upper bounds", () => {
    expect(evaluate(">= 4.01 | <= 4.34", "4.2")).toBe("match");
    expect(evaluate(">= 4.01 | <= 4.34", "4.35")).toBe("no_match");
    expect(evaluate(">=5.3|<5.8.1", "5.8.1")).toBe("no_match");
    expect(evaluate(">= 1.3.4 | < 1.5.3", "1.7.1")).toBe("no_match");
  });

  it("handles lists of exact versions", () => {
    expect(evaluate("9.13 | 9.19 | 9.33 | 12.1", "9.33")).toBe("match");
    expect(evaluate("9.13 | 9.19 | 9.33 | 12.1", "12.1.2")).toBe("no_match");
  });

  it("does not let 9.33 sort after 12.1.2", () => {
    expect(evaluate("<= 9.33.1", "9.33")).toBe("match");
    expect(evaluate("<= 9.33.1", "12.1.2")).toBe("no_match");
    expect(evaluate("<=12.1.3", "12.1.2")).toBe("match");
  });

  it("matches the Contec firmware string despite stripped parentheses", () => {
    expect(
      evaluate("<=CMS7.820.120.01/0.930.95", "CMS7.820.120.01/0.93(0.95)"),
    ).toBe("match");
    expect(
      evaluate("<=CMS7.820.075.08/0.740.75", "CMS7.820.120.01/0.93(0.95)"),
    ).toBe("no_match");
    expect(
      evaluate(
        "<=smart3250-2.6.27-wlan2.1.7.cramfs",
        "CMS7.820.120.01/0.93(0.95)",
      ),
    ).toBe("incomparable");
  });

  it("handles revision letters and revision ranges", () => {
    expect(evaluate("<=N", "M.00.03")).toBe("match");
    expect(evaluate("Rev J-M | (X3/MX100 for Rev M only)", "M.00.03")).toBe(
      "match",
    );
    expect(evaluate("Rev J-M", "N.01")).toBe("no_match");
  });

  it("handles wildcard and prose versions", () => {
    expect(evaluate("8.x model 35700BAX2", "8.00.01")).toBe("match");
    expect(evaluate("v6.x model 35700BAX", "8.00.01")).toBe("no_match");
    expect(evaluate("2.3.6 and  below", "2.3.5")).toBe("match");
    expect(evaluate("<= 1.54 (integrated into GE MobileLink)", "1.60")).toBe(
      "no_match",
    );
    expect(evaluate("<= 1.54 (integrated into GE MobileLink)", "1.6")).toBe(
      "match",
    );
  });

  it("matches every version for an all-versions spec", () => {
    expect(evaluate("vers:all/*", "anything")).toBe("match");
  });
});
