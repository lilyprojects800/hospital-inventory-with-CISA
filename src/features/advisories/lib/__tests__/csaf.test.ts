import { describe, expect, it } from "vitest";
import { parseCsaf } from "../csaf";
import contec from "./fixtures/icsma-25-030-01.json";

describe("parseCsaf", () => {
  const advisory = parseCsaf(contec);

  it("reads the tracking metadata", () => {
    expect(advisory.id).toBe("ICSMA-25-030-01");
    expect(advisory.title).toBe(
      "Contec Health CMS8000 Patient Monitor (Update A)",
    );
    expect(advisory.url).toBe(
      "https://www.cisa.gov/news-events/ics-medical-advisories/icsma-25-030-01",
    );
    expect(advisory.revision).toBe("Update A");
    expect(advisory.releasedAt.toISOString()).toBe("2025-01-30T07:00:00.000Z");
    expect(advisory.revisedAt.toISOString()).toBe("2025-02-25T07:00:00.000Z");
    expect(advisory.summary).toMatch(/^Successful exploitation/);
  });

  it("flattens the product tree into vendor, product and version", () => {
    expect(advisory.products).toHaveLength(4);
    expect(advisory.products[2]).toEqual({
      productId: "CSAFPID-0003",
      vendor: "Contec Health",
      productName: "CMS8000 Patient Monitor Firmware",
      fullName:
        "Contec Health CMS8000 Patient Monitor Firmware: CMS7.820.120.01/0.93(0.95)",
      versionSpec: "CMS7.820.120.01/0.93(0.95)",
      status: "AFFECTED",
    });
    expect(advisory.products[3]).toMatchObject({
      productName: "CMS8000 Patient Monitor",
      versionSpec: "vers:all/*",
      status: "AFFECTED",
    });
  });

  it("reads vulnerabilities and takes the highest score as severity", () => {
    expect(advisory.vulnerabilities.map((v) => v.cve)).toEqual([
      "CVE-2024-12248",
      "CVE-2025-0626",
    ]);
    expect(advisory.vulnerabilities[0]).toMatchObject({
      cvssScore: 9.8,
      cvssSeverity: "CRITICAL",
      productIds: ["CSAFPID-0001", "CSAFPID-0002", "CSAFPID-0003"],
    });
    expect(advisory.severity).toBe(9.8);
  });

  it("deduplicates remediations repeated across vulnerabilities", () => {
    expect(advisory.remediations).toHaveLength(3);
    expect(advisory.remediations[0]).toMatchObject({
      category: "MITIGATION",
      details:
        "Per FDA recommendation, CISA recommends users remove any Contec CMS8000 devices from their networks.",
    });
    expect(advisory.remediations[0].productIds).toEqual([
      "CSAFPID-0001",
      "CSAFPID-0002",
      "CSAFPID-0003",
      "CSAFPID-0004",
    ]);
  });

  it("rejects documents without tracking data", () => {
    expect(() => parseCsaf({ document: { title: "x" } })).toThrow();
  });
});
