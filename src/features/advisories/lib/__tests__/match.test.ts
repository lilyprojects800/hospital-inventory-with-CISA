import { describe, expect, it } from "vitest";
import {
  type MatchableAsset,
  type MatchableProduct,
  matchAssetToAdvisory,
  relevantToProducts,
  remediationLevel,
  severityLabel,
  sortRemediations,
} from "../match";

const asset = (
  manufacturer: string,
  product: string,
  version: string | null,
  versionStatus: MatchableAsset["versionStatus"] = version
    ? "KNOWN"
    : "UNKNOWN",
): MatchableAsset => ({ manufacturer, product, version, versionStatus });

const product = (
  productId: string,
  vendor: string,
  productName: string,
  versionSpec: string | null,
  status: MatchableProduct["status"] = "AFFECTED",
): MatchableProduct => ({
  productId,
  vendor,
  productName,
  versionSpec,
  status,
});

const contec2022 = [
  product(
    "P1",
    "Contec Health",
    "CMS8000 CONTEC ICU CCU Vital Signs Patient Monitor",
    "<=smart3250-2.6.27-wlan2.1.7.cramfs",
  ),
  product(
    "P2",
    "Contec Health",
    "CMS8000 CONTEC ICU CCU Vital Signs Patient Monitor",
    "<=CMS7.820.075.08/0.740.75",
  ),
  product(
    "P3",
    "Contec Health",
    "CMS8000 CONTEC ICU CCU Vital Signs Patient Monitor",
    "<=CMS7.820.120.01/0.930.95",
  ),
];

const life2000 = [
  product("P1", "Baxter", "Life2000 Ventilation System", "<=06.08.00.00"),
];

describe("matchAssetToAdvisory", () => {
  it("marks a device inside the affected range as affected", () => {
    const result = matchAssetToAdvisory(
      asset("Baxter", "Life2000 Ventilator", "06.07.00.00"),
      life2000,
    );
    expect(result?.status).toBe("AFFECTED");
    expect(result?.matchedProductIds).toEqual(["P1"]);
    expect(result?.reason).toContain("06.07.00.00");
  });

  it("ignores a device outside the affected range", () => {
    expect(
      matchAssetToAdvisory(
        asset("Baxter", "Life2000 Ventilator", "06.09.00.00"),
        life2000,
      ),
    ).toBeNull();
  });

  it("marks a matching device with an unknown version as possibly affected", () => {
    const result = matchAssetToAdvisory(
      asset("Baxter", "Life2000 Ventilator", null),
      life2000,
    );
    expect(result?.status).toBe("POSSIBLY_AFFECTED");
    expect(result?.reason).toContain("unknown");
  });

  it("explains a device with no version", () => {
    const result = matchAssetToAdvisory(
      asset("Baxter", "Life2000 Ventilator", null, "NOT_APPLICABLE"),
      life2000,
    );
    expect(result?.status).toBe("POSSIBLY_AFFECTED");
    expect(result?.reason).toContain("no version");
  });

  it("picks the right Contec firmware entry and ignores other schemes", () => {
    const result = matchAssetToAdvisory(
      asset(
        "Contec Health",
        "CMS8000 Patient Monitor",
        "CMS7.820.120.01/0.93(0.95)",
      ),
      contec2022,
    );
    expect(result?.status).toBe("AFFECTED");
    expect(result?.matchedProductIds).toEqual(["P3"]);
  });

  it("does not fall back to possibly affected when a comparable entry rules the device out", () => {
    expect(
      matchAssetToAdvisory(
        asset("Contec Health", "CMS8000 Patient Monitor", "CMS7.820.200.01"),
        contec2022,
      ),
    ).toBeNull();
  });

  it("treats all-version advisories as affected even without a version", () => {
    const result = matchAssetToAdvisory(
      asset("Contec Health", "CMS8000 Patient Monitor", null),
      [product("P4", "Contec Health", "CMS8000 Patient Monitor", "vers:all/*")],
    );
    expect(result?.status).toBe("AFFECTED");
  });

  it("only counts products the advisory lists as affected", () => {
    expect(
      matchAssetToAdvisory(
        asset("Baxter", "Life2000 Ventilator", "06.07.00.00"),
        [
          product(
            "P1",
            "Baxter",
            "Life2000 Ventilation System",
            "<=06.08.00.00",
            "FIXED",
          ),
        ],
      ),
    ).toBeNull();
  });

  it("downgrades to possibly affected while the vendor investigates", () => {
    const result = matchAssetToAdvisory(
      asset("Baxter", "Life2000 Ventilator", "06.07.00.00"),
      [
        product(
          "P1",
          "Baxter",
          "Life2000 Ventilation System",
          "<=06.08.00.00",
          "UNDER_INVESTIGATION",
        ),
      ],
    );
    expect(result?.status).toBe("POSSIBLY_AFFECTED");
  });

  it("downgrades a model-specific advisory when the device model is not recorded", () => {
    const result = matchAssetToAdvisory(
      asset("Medtronic", "MyCareLink Patient Monitor", null),
      [
        product(
          "P1",
          "Medtronic",
          "MyCareLink Patient Monitor model 24950",
          "vers:all/*",
        ),
      ],
    );
    expect(result?.status).toBe("POSSIBLY_AFFECTED");
    expect(result?.reason).toContain("model number");
  });

  it("tells the Alaris 12.1.2 and 9.33 units apart", () => {
    const products = [
      product(
        "P1",
        "Becton, Dickinson and Company (BD)",
        "Alaris PC Unit Model 8015",
        "<= 9.33.1",
      ),
    ];
    expect(
      matchAssetToAdvisory(asset("BD", "Alaris 8015 PC Unit", "9.33"), products)
        ?.status,
    ).toBe("AFFECTED");
    expect(
      matchAssetToAdvisory(
        asset("BD", "Alaris 8015 PC Unit", "12.1.2"),
        products,
      ),
    ).toBeNull();
  });

  it("never matches a product the advisory does not mention", () => {
    expect(
      matchAssetToAdvisory(
        asset("Zebra", "ZD621 Printer", null, "NOT_APPLICABLE"),
        life2000,
      ),
    ).toBeNull();
  });
});

describe("remediationLevel", () => {
  it("prefers vendor fixes, then mitigations", () => {
    expect(remediationLevel(["MITIGATION", "VENDOR_FIX"])).toBe("VENDOR_FIX");
    expect(remediationLevel(["WORKAROUND"])).toBe("MITIGATION_ONLY");
    expect(remediationLevel(["NO_FIX_PLANNED"])).toBe("NO_REMEDIATION");
    expect(remediationLevel([])).toBe("NO_REMEDIATION");
  });
});

describe("sortRemediations", () => {
  it("puts vendor fixes first", () => {
    const sorted = sortRemediations([
      { category: "MITIGATION" as const },
      { category: "VENDOR_FIX" as const },
      { category: "WORKAROUND" as const },
    ]);
    expect(sorted.map((r) => r.category)).toEqual([
      "VENDOR_FIX",
      "WORKAROUND",
      "MITIGATION",
    ]);
  });
});

describe("severityLabel", () => {
  it("maps CVSS scores to labels", () => {
    expect(severityLabel(9.8)).toBe("Critical");
    expect(severityLabel(7.5)).toBe("High");
    expect(severityLabel(5.9)).toBe("Medium");
    expect(severityLabel(2)).toBe("Low");
    expect(severityLabel(0)).toBe("None");
  });
});

describe("relevantToProducts", () => {
  it("keeps items for the matched products and items with no product list", () => {
    const items = [
      { id: 1, productIds: ["P1"] },
      { id: 2, productIds: ["P2"] },
      { id: 3, productIds: [] },
    ];
    expect(relevantToProducts(items, ["P1"]).map((i) => i.id)).toEqual([1, 3]);
  });
});
