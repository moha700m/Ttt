import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { analyzeDocument, buildValidationReport, translateDocument, translateTextMock } from "@/lib/document-engine";

describe("document engine", () => {
  it("keeps PDF page count stable", async () => {
    const document = await PDFDocument.create(); document.addPage(); document.addPage();
    const bytes = Buffer.from(await document.save());
    expect((await analyzeDocument(bytes, "source.pdf")).pages).toBe(2);
  });
  it("uses a deterministic mock glossary without touching unknown text", () => {
    expect(translateTextMock("Invoice", "en", "ar")).toBe("فاتورة");
    expect(translateTextMock("Unlisted phrase", "en", "ar")).toBe("Unlisted phrase");
    expect(translateTextMock("Invoice 123 - $45.00", "en", "ar")).toBe("فاتورة 123 - $45.00");
  });
  it("returns an explicit safety report", () => {
    expect(buildValidationReport(4, 1).formatting).toBe("PASS");
  });
  it("fails closed instead of rasterizing a scanned PDF in visual-protection mode", async () => {
    const document = await PDFDocument.create(); document.addPage();
    const bytes = Buffer.from(await document.save());
    await expect(translateDocument(bytes, "scanned.pdf", "en", "ar", { protectVisualElements: true }))
      .rejects.toThrow("PDF_TEXT_LAYER_REQUIRED_FOR_PROTECTED_MODE");
  });
});
