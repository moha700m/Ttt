import { describe, expect, it } from "vitest";
import { hashToken, safeFilename, sha256 } from "@/lib/security";

describe("security primitives", () => {
  it("hashes capability tokens and never stores the raw value", () => {
    expect(hashToken("secret")).not.toBe("secret"); expect(hashToken("secret")).toHaveLength(64);
  });
  it("normalizes filenames", () => { expect(safeFilename("../../secret file.pdf")).toBe(".._.._secret_file.pdf"); });
  it("calculates stable hashes", () => { expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"); });
});
