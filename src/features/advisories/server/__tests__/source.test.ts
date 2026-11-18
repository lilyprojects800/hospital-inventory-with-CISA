import { describe, expect, it } from "vitest";
import { parseChangesCsv } from "../source";

describe("parseChangesCsv", () => {
  it("keeps only medical advisories and their latest timestamp", () => {
    const csv = [
      '"2026/icsa-26-321-11.json","2026-11-17T07:00:00.000000Z"',
      '"2025/icsma-25-030-01.json","2025-02-25T07:00:00.000000Z"',
      '"2024/icsma-24-319-01.json","2024-11-14T07:00:00.000000Z"',
      '"2025/icsma-25-030-01.json","2025-01-30T07:00:00.000000Z"',
      "",
      "not,a,valid,row",
      '"2023/icsma-23-194-01.json","not-a-date"',
    ].join("\r\n");

    expect(parseChangesCsv(csv)).toEqual([
      {
        path: "2025/icsma-25-030-01.json",
        updatedAt: "2025-02-25T07:00:00.000000Z",
      },
      {
        path: "2024/icsma-24-319-01.json",
        updatedAt: "2024-11-14T07:00:00.000000Z",
      },
    ]);
  });
});
