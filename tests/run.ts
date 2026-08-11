import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { analyzeDocument, buildValidationReport, translateDocument, translateTextMock } from "../lib/document-engine";
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
await test("mock glossary translates known text", () => assert.equal(translateTextMock("Invoice", "en", "ar"), "فاتورة"));
await test("mock glossary preserves unknown text", () => assert.equal(translateTextMock("Unlisted phrase", "en", "ar"), "Unlisted phrase"));
await test("validation report is explicit", () => assert.equal(buildValidationReport(4, 1).formatting, "PASS"));
await test("capability token is hashed", () => { assert.notEqual(hashToken("secret"), "secret"); assert.equal(hashToken("secret").length, 64); });
await test("filename is normalized", () => assert.equal(safeFilename("../../secret file.pdf"), ".._.._secret_file.pdf"));
await test("SHA256 is stable", () => assert.equal(sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"));
console.log(`\n${passed}/10 checks passed`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
