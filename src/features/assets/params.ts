import { parseAsStringLiteral } from "nuqs/server";
import { createPaginationParams } from "@/lib/url-state";

export const EXPOSURE_FILTERS = [
  "all",
  "affected",
  "possibly",
  "any",
  "unfixed",
  "none",
] as const;

export const assetsParams = {
  ...createPaginationParams(),
  exposure: parseAsStringLiteral(EXPOSURE_FILTERS)
    .withDefault("all")
    .withOptions({ clearOnDefault: true }),
};
