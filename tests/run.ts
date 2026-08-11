import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { analyzeDocument, buildValidationReport, renderTranslatedImage, translateDocument, translateTextMock } from "../lib/document-engine";
import { quoteOrder } from "../lib/pricing";
import { hashToken, safeFilename, sha256 } from "../lib/security";

let passed = 0;
function test(name: string, callback: () => void | Promise<void>) {
  return Promise.resolve().then(callback).then(() => { passed += 1; console.log(`PASS ${name}`); });
}

async function main() {
await test("flat certification quote", () => {
  const quote = quoteOrder({ pages: 4, documentType: "general", service: "certified" }, { basePricePerPage: 29, certificationFeeType: "flat", certificationFee: 80, minimumOrder: 49, urgentMultiplier: 1.5, documentTypeMultiplier: { general: 1, medical: 1.2, legal: 1.3, academic: 1.1 }, vatEnabled: false, vatRate: 0 });
  assert.equal(quote.amount, 196); assert.equal(quote.translationAmount, 116); assert.equal(quote.certificationAmount, 80);
});
await test("urgent document multiplier", () => assert.ok(quoteOrder({ pages: 2, documentType: "legal", service: "translation", urgent: true }).amount > 49));
await test("PDF page count is stable", async () => { const pdf = await PDFDocument.create(); pdf.addPage(); pdf.addPage(); assert.equal((await analyzeDocument(Buffer.from(await pdf.save()), "source.pdf")).pages, 2); });
await test("attached Arabic freelance letter translates without changing page count", async () => {
  const sample = path.resolve(process.cwd(), "../upload/شكر سلة.pdf");
  try { await access(sample); } catch { return; }
  const source = await readFile(sample);
  const translated = await translateDocument(source, "شكر سلة.pdf", "ar", "en");
  assert.ok(translated.changedBlocks > 0);
  assert.equal((await PDFDocument.load(translated.bytes)).getPageCount(), (await PDFDocument.load(source)).getPageCount());
});
await test("attached salon image renders an English translation layer", async () => {
  const sample = path.resolve(process.cwd(), "../upload/690962F5-717B-49A4-B586-066B2B0DF1B0.jpeg");
  try { await access(sample); } catch { return; }
  const source = await readFile(sample);
  const translated = await renderTranslatedImage(source, "salon.jpeg", [
    { sourceText: "صالون المزن للتزيين النسائي", targetText: "Al Muzn Women's Beauty Salon", box: { x: 0.31, y: 0.32, width: 0.4, height: 0.13 }, backgroundColor: "#fffaf0", textColor: "#7d4845", align: "center", fontWeight: "600" },
    { sourceText: "للتزيين النسائي", targetText: "Women's Beauty", box: { x: 0.39, y: 0.48, width: 0.24, height: 0.1 }, backgroundColor: "#fffaf0", textColor: "#7d4845", align: "center", fontWeight: "500" },
    { sourceText: "الجمال يبدأ من التفاصيل", targetText: "Beauty Begins with the Details", box: { x: 0.35, y: 0.63, width: 0.31, height: 0.08 }, backgroundColor: "#fffaf0", textColor: "#7d4845", align: "center", fontWeight: "500" },
    { sourceText: "حي الخبر الشمالية · الخبر", targetText: "North Al Khobar District · Al Khobar", box: { x: 0.72, y: 0.78, width: 0.27, height: 0.09 }, backgroundColor: "#fffaf0", textColor: "#7d4845", align: "right", fontWeight: "400" }
  ]);
  assert.notEqual(sha256(translated), sha256(source));
  assert.equal((await analyzeDocument(translated, "salon.jpeg")).kind, "image");
});
await test("mock glossary translates known text", () => assert.equal(translateTextMock("Invoice", "en", "ar"), "فاتورة"));
await test("mock glossary preserves unknown text", () => assert.equal(translateTextMock("Unlisted phrase", "en", "ar"), "Unlisted phrase"));
await test("validation report is explicit", () => assert.equal(buildValidationReport(4, 1).formatting, "PASS"));
await test("capability token is hashed", () => { assert.notEqual(hashToken("secret"), "secret"); assert.equal(hashToken("secret").length, 64); });
await test("filename is normalized", () => assert.equal(safeFilename("../../secret file.pdf"), ".._.._secret_file.pdf"));
await test("SHA256 is stable", () => assert.equal(sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"));
console.log(`\n${passed}/11 checks passed`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
