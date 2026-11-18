import { describe, expect, it } from "vitest";
import { matchProduct, vendorsMatch } from "../products";

const asset = (manufacturer: string, product: string) => ({
  manufacturer,
  product,
});
const advisory = (vendor: string, productName: string) => ({
  vendor,
  productName,
});

describe("vendorsMatch", () => {
  it("matches abbreviations given in parentheses", () => {
    expect(vendorsMatch("BD", "Becton, Dickinson and Company (BD)")).toBe(true);
    expect(vendorsMatch("GE Healthcare", "General Electric (GE)")).toBe(true);
  });

  it("ignores legal and industry suffixes", () => {
    expect(vendorsMatch("Contec Health", "Contec Health")).toBe(true);
    expect(vendorsMatch("Hamilton Medical", "Hamilton Medical AG")).toBe(true);
    expect(vendorsMatch("Siemens Healthineers", "Siemens")).toBe(true);
    expect(vendorsMatch("B. Braun", "B. Braun Melsungen AG")).toBe(true);
  });

  it("handles known misspellings and accents", () => {
    expect(vendorsMatch("Philips", "Phillips")).toBe(true);
    expect(vendorsMatch("Dräger", "Drager")).toBe(true);
  });

  it("rejects different vendors", () => {
    expect(vendorsMatch("Baxter", "BD")).toBe(false);
    expect(vendorsMatch("GE Healthcare", "Philips")).toBe(false);
  });
});

describe("matchProduct", () => {
  it("matches the same model under different wording", () => {
    expect(
      matchProduct(
        asset("Baxter", "Life2000 Ventilator"),
        advisory("Baxter", "Life2000 Ventilation System"),
      ),
    ).toBe("exact");
    expect(
      matchProduct(
        asset("BD", "Alaris 8015 PC Unit"),
        advisory(
          "Becton, Dickinson and Company (BD)",
          "BD Alaris Point-of-Care Unit (PCU) Model 8015",
        ),
      ),
    ).toBe("exact");
    expect(
      matchProduct(
        asset("Contec Health", "CMS8000 Patient Monitor"),
        advisory(
          "Contec Health",
          "CMS8000 CONTEC ICU CCU Vital Signs Patient Monitor",
        ),
      ),
    ).toBe("exact");
  });

  it("does not confuse neighbouring models", () => {
    expect(
      matchProduct(
        asset("BD", "Alaris 8015 PC Unit"),
        advisory("Becton, Dickinson and Company (BD)", "Alaris 8000 PC unit"),
      ),
    ).toBeNull();
    expect(
      matchProduct(
        asset("Philips", "IntelliVue MX450"),
        advisory("Philips", "IntelliVue MX40 Patient Worn Monitor (WLAN only)"),
      ),
    ).toBeNull();
  });

  it("matches a model inside a model range", () => {
    expect(
      matchProduct(
        asset("Philips", "IntelliVue MX450"),
        advisory("Philips", "IntelliVue patient monitor MX400-MX850"),
      ),
    ).toBe("exact");
    expect(
      matchProduct(
        asset("Philips", "IntelliVue MX800"),
        advisory("Philips", "IntelliVue Patient Monitors MX (MX400-550)"),
      ),
    ).toBeNull();
  });

  it("matches a product family that names no model", () => {
    expect(
      matchProduct(
        asset("BD", "Alaris 8015 PC Unit"),
        advisory("Becton, Dickinson and Company (BD)", "Alaris PC Unit"),
      ),
    ).toBe("exact");
  });

  it("rejects sibling products in the same family", () => {
    expect(
      matchProduct(
        asset("BD", "Alaris 8015 PC Unit"),
        advisory("Becton, Dickinson and Company (BD)", "Alaris CC"),
      ),
    ).toBeNull();
    expect(
      matchProduct(
        asset("BD", "Pyxis MedStation ES"),
        advisory(
          "Becton, Dickinson and Company (BD)",
          "BD Pyxis MedStation ES Server",
        ),
      ),
    ).toBeNull();
    expect(
      matchProduct(
        asset("BD", "Pyxis MedStation ES"),
        advisory(
          "Becton, Dickinson and Company (BD)",
          "BD Pyxis MedStation 4000",
        ),
      ),
    ).toBeNull();
    expect(
      matchProduct(
        asset("GE Healthcare", "CARESCAPE B650"),
        advisory("General Electric (GE)", "CARESCAPE Central Station (CSCS)"),
      ),
    ).toBeNull();
  });

  it("flags an advisory model the device record does not specify", () => {
    expect(
      matchProduct(
        asset("Medtronic", "MyCareLink Patient Monitor"),
        advisory("Medtronic", "MyCareLink Patient Monitor model 24950"),
      ),
    ).toBe("model_unspecified");
  });

  it("requires the vendor to match", () => {
    expect(
      matchProduct(
        asset("BD", "Alaris 8015 PC Unit"),
        advisory("GE Healthcare", "Alaris PC Unit"),
      ),
    ).toBeNull();
  });
});
