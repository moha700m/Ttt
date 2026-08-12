import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { addPdfWatermark, renderTranslatedImage, translateDocument } from "../lib/document-engine";

const workDirectory = path.resolve("work/pdf-regression");

function pdfJsOptions(data: Buffer) {
  const root = path.join(process.cwd(), "node_modules/pdfjs-dist").replaceAll("\\", "/");
  return {
    data: new Uint8Array(data),
    standardFontDataUrl: `${root}/standard_fonts/`,
    cMapUrl: `${root}/cmaps/`,
    cMapPacked: true,
    useWorkerFetch: false
  };
}

function decodePdfStreams(bytes: Buffer) {
  const raw = bytes.toString("latin1");
  let decoded = raw;
  let cursor = 0;
  while (true) {
    const streamIndex = raw.indexOf("stream", cursor);
    if (streamIndex < 0) break;
    let start = streamIndex + "stream".length;
    if (bytes[start] === 13 && bytes[start + 1] === 10) start += 2;
    else if (bytes[start] === 10 || bytes[start] === 13) start += 1;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    try {
      decoded += `\n${inflateSync(bytes.subarray(start, end)).toString("latin1")}`;
    } catch {
      // Some PDF streams are intentionally not Flate-compressed.
    }
    cursor = end + "endstream".length;
  }
  return decoded;
}

async function buildFixture() {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const logoCanvas = createCanvas(96, 48);
  const logoContext = logoCanvas.getContext("2d");
  logoContext.fillStyle = "#1f5a91";
  logoContext.fillRect(0, 0, 96, 48);
  logoContext.fillStyle = "#ffffff";
  logoContext.font = "bold 22px Arial";
  logoContext.fillText("GOV", 29, 31);
  const logo = await document.embedPng(logoCanvas.toBuffer("image/png"));
  for (let pageIndex = 0; pageIndex < 2; pageIndex += 1) {
    const page = document.addPage([595, 842]);
    page.drawImage(logo, { x: 54, y: 770, width: 96, height: 48 });
    page.drawText(pageIndex === 0 ? "Invoice" : "Invoice number", { x: 54, y: 750, size: 24, font });
    page.drawText(pageIndex === 0 ? "Date" : "Name", { x: 54, y: 710, size: 15, font });
    page.drawText(pageIndex === 0 ? "Total" : "Payment status", { x: 54, y: 670, size: 15, font });
    page.drawText("2026-08-12 | $1,250.00 | #A-204", { x: 54, y: 630, size: 13, font });
    page.drawRectangle({ x: 48, y: 470, width: 500, height: 100, borderColor: rgb(0.2, 0.3, 0.4), borderWidth: 1 });
    page.drawLine({ start: { x: 48, y: 520 }, end: { x: 548, y: 520 }, thickness: 1, color: rgb(0.2, 0.3, 0.4) });
    page.drawLine({ start: { x: 298, y: 470 }, end: { x: 298, y: 570 }, thickness: 1, color: rgb(0.2, 0.3, 0.4) });
  }
  return Buffer.from(await document.save());
}

function countPdfImages(bytes: Buffer) {
  return (bytes.toString("latin1").match(/\/Subtype\s*\/Image\b/g) || []).length;
}

async function main() {
  await mkdir(workDirectory, { recursive: true });
  process.env.AI_PROVIDER = "mock";
  const imageCanvas = createCanvas(600, 200);
  const imageContext = imageCanvas.getContext("2d");
  imageContext.fillStyle = "#ffffff";
  imageContext.fillRect(0, 0, 600, 200);
  const translatedImage = await renderTranslatedImage(imageCanvas.toBuffer("image/png"), "arabic-regression.png", [
    { sourceText: "Invoice", targetText: "فاتورة 123 - $45.00", box: { x: 40, y: 40, width: 520, height: 100 }, backgroundColor: "#ffffff", textColor: "#111827", align: "right", fontWeight: "600" }
  ]);
  assert.ok(translatedImage.length > 1000, "Arabic image overlay must render with bundled fonts");
  await writeFile(path.join(workDirectory, "arabic-image-preview.png"), translatedImage);
  const source = await buildFixture();
  const translated = await translateDocument(source, "pdf-regression.pdf", "en", "ar");
  assert.ok(translated.changedBlocks >= 6, "mock translation should replace the fixture's translatable blocks");
  assert.equal(countPdfImages(translated.bytes), countPdfImages(source), "protected PDF translation must preserve embedded images");

  const preview = await addPdfWatermark(translated.bytes, "PREVIEW ONLY - NOT FOR DELIVERY - REGRESSION");
  await writeFile(path.join(workDirectory, "source.pdf"), source);
  await writeFile(path.join(workDirectory, "translated.pdf"), translated.bytes);
  await writeFile(path.join(workDirectory, "preview.pdf"), preview);
  await writeFile(path.join(workDirectory, "download.pdf"), preview);

  const downloaded = await readFile(path.join(workDirectory, "download.pdf"));
  const downloadedDocument = await PDFDocument.load(downloaded);
  assert.equal(downloadedDocument.getPageCount(), 2, "downloaded preview must retain every page");
  const fontText = decodePdfStreams(downloaded);
  assert.ok((fontText.match(/\/FontFile2/g) || []).length >= 2, "translated and watermark fonts must be embedded as TrueType fonts");

  const previewDocument = await pdfjs.getDocument(pdfJsOptions(downloaded)).promise;
  assert.equal(previewDocument.numPages, 2, "browser preview bytes must retain every page");
  for (let pageIndex = 1; pageIndex <= previewDocument.numPages; pageIndex += 1) {
    const page = await previewDocument.getPage(pageIndex);
    const content = await page.getTextContent();
    const text = content.items.map((item) => "str" in item && typeof item.str === "string" ? item.str : "").join(" ");
    assert.match(text, /[\u0600-\u06ff]/, `page ${pageIndex} must contain Arabic glyphs`);
    assert.doesNotMatch(text, /[\u25a1\ufffd]/, `page ${pageIndex} must not contain replacement or square glyphs`);
    if (pageIndex === 1) {
      assert.match(text, /فاتورة/, "Arabic text must remain in logical reading order");
      assert.doesNotMatch(text, /ةروتاف/, "Arabic text must not be reversed before font shaping");
    }
    assert.match(text, /PREVIEW|DELIVERY/, `page ${pageIndex} must contain the PDF watermark`);

    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: canvas.getContext("2d"), viewport, canvas } as never).promise;
    const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let darkPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] < 100 && pixels[index + 1] < 100 && pixels[index + 2] < 100 && pixels[index + 3] > 0) darkPixels += 1;
    }
    assert.ok(darkPixels > 100, `page ${pageIndex} must render visible document content`);
    await writeFile(path.join(workDirectory, `preview-page-${pageIndex}.png`), canvas.toBuffer("image/png"));
  }
  console.log("PDF regression: PASS (translation, embedded fonts, pages, watermark, preview render, download)");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
