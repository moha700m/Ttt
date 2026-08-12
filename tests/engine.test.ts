import { describe, expect, it } from "vitest";
import AdmZip from "adm-zip";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { analyzeDocument, buildValidationReport, createDocxPreviewPdf, translateDocument, translateTextMock } from "@/lib/document-engine";

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
  it("does not rewrite standalone image files while visual protection is enabled", async () => {
    const image = await sharp({ create: { width: 12, height: 12, channels: 3, background: "#ffffff" } }).png().toBuffer();
    await expect(translateDocument(image, "protected.png", "en", "ar", { protectVisualElements: true }))
      .rejects.toThrow("IMAGE_TRANSLATION_REQUIRES_UNPROTECTED_MODE");
  });
  it("creates a two-page image PDF preview for translated DOCX files", async () => {
    const zip = new AdmZip();
    zip.addFile("word/document.xml", Buffer.from(`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>Invoice</w:t></w:r></w:p><w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p><w:r><w:t>Date</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`));
    const translated = await translateDocument(zip.toBuffer(), "preview.docx", "en", "ar");
    const preview = await createDocxPreviewPdf(translated.bytes, 2);
    const previewDocument = await PDFDocument.load(preview);
    expect(translated.changedBlocks).toBeGreaterThan(0);
    expect(previewDocument.getPageCount()).toBe(2);
    expect((preview.toString("latin1").match(/\/Subtype\s*\/Image\b/g) || []).length).toBe(2);
  });
});
