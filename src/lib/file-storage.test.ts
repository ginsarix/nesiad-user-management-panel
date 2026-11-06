import { describe, expect, it, vi } from "vitest";

const unlink = vi.hoisted(() => vi.fn());
vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  unlink,
}));

import { deleteFiles } from "./file-storage";

describe("deleteFiles", () => {
  it("attempts every file when one fails, and never throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    unlink.mockImplementation(async (path: string) => {
      if (path.endsWith("b.png")) {
        throw Object.assign(new Error("EACCES: /secret/path 10000000146"), {
          code: "EACCES",
        });
      }
    });

    await expect(
      deleteFiles(["a.png", "b.png", null, undefined, "c.png"]),
    ).resolves.toBeUndefined();

    expect(
      unlink.mock.calls.map(([path]) => String(path).split("/").pop()),
    ).toEqual(["a.png", "b.png", "c.png"]);
    expect(error).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).toContain("b.png");
    expect(logged).toContain("EACCES");
    expect(logged).not.toContain("10000000146");
    error.mockRestore();
  });
});
