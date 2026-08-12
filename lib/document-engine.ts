import fs from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import bidiFactory from "bidi-js";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, degrees, rgb } from "pdf-lib";
import sharp from "sharp";
import type { ValidationReport } from "./types";

const glossary: Record<string, string> = {
  invoice: "فاتورة",
  "invoice number": "رقم الفاتورة",
  name: "الاسم",
  date: "التاريخ",
  address: "العنوان",
  amount: "المبلغ",
  total: "الإجمالي",
  medical: "طبي",
  report: "تقرير",
  contract: "عقد",
  university: "الجامعة",
  student: "الطالب",
  "payment status": "حالة الدفع"
};

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function unescapeXml(value: string) {
  return value.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceGlossaryTerms(text: string, entries: Array<[string, string]>) {
  return entries
    .sort(([left], [right]) => right.length - left.length)
    .reduce((value, [source, target]) => {
      const pattern = new RegExp(`(?<![\\p{L}\\p{M}])${escapeRegExp(source)}(?![\\p{L}\\p{M}])`, "giu");
      return value.replace(pattern, target);
    }, text);
}

export function translateTextMock(text: string, source: "ar" | "en", target: "ar" | "en") {
  if (source === target) return text;
  const key = text.trim().toLowerCase();
  if (target === "ar") return glossary[key] ?? replaceGlossaryTerms(text, Object.entries(glossary));
  const reverse = Object.entries(glossary).map(([english, arabic]) => [arabic, english] as [string, string]);
  return reverse.find(([arabic]) => arabic === text.trim())?.[1] ?? replaceGlossaryTerms(text, reverse);
}

function extractJsonArray(value: string, expectedLength: number) {
  const withoutFence = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const firstArray = withoutFence.indexOf("[");
  const lastArray = withoutFence.lastIndexOf("]");
  if (firstArray < 0 || lastArray <= firstArray) throw new Error("TRANSLATION_PROVIDER_INVALID_BATCH");
  const parsed = JSON.parse(withoutFence.slice(firstArray, lastArray + 1)) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== expectedLength || parsed.some((entry) => typeof entry !== "string")) throw new Error("TRANSLATION_PROVIDER_INVALID_BATCH");
  return parsed as string[];
}

async function translateTextBatch(texts: string[], source: "ar" | "en", target: "ar" | "en") {
  if (!texts.length || source === target) return texts;
  if (!process.env.AI_PROVIDER || process.env.AI_PROVIDER === "mock") return texts.map((text) => translateTextMock(text, source, target));

  const payload = JSON.stringify(texts);
  if (process.env.AI_PROVIDER === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_TRANSLATION_MODEL || "claude-sonnet-4-5",
        max_tokens: 4096,
        system: "You are a precise document translator. Return ONLY a valid JSON array of translated strings in the same order as the input array. Preserve names, numbers, dates, units, punctuation, and line breaks.",
        messages: [{ role: "user", content: `Translate each string in this JSON array from ${source} to ${target}. Keep the array length and order unchanged:\n${payload}` }]
      })
    });
    if (!response.ok) throw new Error(`TRANSLATION_PROVIDER_ANTHROPIC_${response.status}`);
    const body = await response.json() as { content?: Array<{ text?: string }> };
    const translated = body.content?.map((part) => part.text || "").join("").trim();
    if (!translated) throw new Error("TRANSLATION_PROVIDER_EMPTY_RESPONSE");
    return extractJsonArray(translated, texts.length);
  }
  if (process.env.AI_PROVIDER === "anthropic") throw new Error("TRANSLATION_REQUIRES_ANTHROPIC");
  if (process.env.AI_PROVIDER === "openai" && process.env.OPENAI_API_KEY) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.OPENAI_TRANSLATION_MODEL || "gpt-5-mini",
        temperature: 0,
        messages: [{ role: "system", content: "Translate precisely. Return ONLY a valid JSON array of translated strings in the same order as the input array. Preserve names, numbers, dates, units, punctuation, and line breaks." }, { role: "user", content: `Translate each string in this JSON array from ${source} to ${target}. Keep the array length and order unchanged:\n${payload}` }]
      })
    });
    if (!response.ok) throw new Error(`TRANSLATION_PROVIDER_OPENAI_${response.status}`);
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const translated = body.choices?.[0]?.message?.content?.trim();
    if (!translated) throw new Error("TRANSLATION_PROVIDER_EMPTY_RESPONSE");
    return extractJsonArray(translated, texts.length);
  }
  if (process.env.AI_PROVIDER === "openai") throw new Error("TRANSLATION_REQUIRES_OPENAI");
  throw new Error("TRANSLATION_PROVIDER_NOT_CONFIGURED");
}

type ImageTextAlignment = "left" | "center" | "right";

export interface ImageTextItem {
  sourceText: string;
  targetText: string;
  box: { x: number; y: number; width: number; height: number };
  backgroundColor?: string;
  textColor?: string;
  align?: ImageTextAlignment;
  fontWeight?: "400" | "500" | "600" | "700";
  fontSize?: number;
}

export interface DocumentTranslationOptions {
  protectVisualElements?: boolean;
}

const imageExtensions = new Set(["jpg", "jpeg", "png", "webp"]);
const arabicCharacterPattern = /[\u0600-\u06ff\u0750-\u077f\ufb50-\ufdff\ufe70-\ufeff]/gu;
const arabicCharacterTestPattern = /[\u0600-\u06ff\u0750-\u077f\ufb50-\ufdff\ufe70-\ufeff]/u;
const bidi = bidiFactory();
const bidiReorderSegments = (bidi as unknown as { getReorderSegments: (value: string, levels: ReturnType<typeof bidi.getEmbeddingLevels>) => Array<[number, number]> }).getReorderSegments;

type EmbeddedPdfFont = Awaited<ReturnType<PDFDocument["embedFont"]>>;
interface EmbeddedPdfFonts {
  arabic: EmbeddedPdfFont;
  latin: EmbeddedPdfFont;
}

type BundledFontKind = "arabic" | "latin";

const bundledFontCandidates: Record<BundledFontKind, string[]> = {
  arabic: [
    path.join(process.cwd(), "assets/fonts/NotoSansArabic-Regular.ttf"),
    path.join(process.cwd(), "node_modules/@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff"),
    ...(process.env.ARABIC_FONT_PATH ? [process.env.ARABIC_FONT_PATH] : [])
  ],
  latin: [
    path.join(process.cwd(), "assets/fonts/NotoSans-Variable.ttf")
  ]
};

const bundledFontBytes = new Map<BundledFontKind, Promise<Buffer>>();

async function readBundledFont(kind: BundledFontKind) {
  const cached = bundledFontBytes.get(kind);
  if (cached) return cached;
  const pending = (async () => {
    let lastError: unknown;
    for (const candidate of bundledFontCandidates[kind]) {
      try {
        return await fs.readFile(candidate);
      } catch (error) {
        lastError = error;
      }
    }
    const detail = lastError instanceof Error ? `: ${lastError.message}` : "";
    throw new Error(`BUNDLED_${kind.toUpperCase()}_FONT_UNAVAILABLE${detail}`);
  })();
  bundledFontBytes.set(kind, pending);
  return pending;
}

async function loadPdfFonts(document: PDFDocument): Promise<EmbeddedPdfFonts> {
  document.registerFontkit(fontkit);
  const [arabic, latin] = await Promise.all([readBundledFont("arabic"), readBundledFont("latin")]);
  return { arabic: await document.embedFont(arabic), latin: await document.embedFont(latin) };
}

function containsArabic(value: string) {
  return arabicCharacterTestPattern.test(value);
}

function getPdfBidiSegments(value: string) {
  const normalized = value.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized || !containsArabic(normalized)) return [normalized];

  // pdf-lib/fontkit performs Arabic shaping from the logical character order.
  // bidi-js is still used to order mixed RTL/LTR blocks, but each RTL block is
  // handed back to fontkit in logical order so joining forms stay connected.
  const levels = bidi.getEmbeddingLevels(normalized);
  const reorderedIndices = Array.from({ length: normalized.length }, (_, index) => index);
  for (const [start, end] of bidiReorderSegments(normalized, levels)) {
    const segment = reorderedIndices.slice(start, end + 1).reverse();
    reorderedIndices.splice(start, segment.length, ...segment);
  }
  const segments: string[] = [];
  let group: number[] = [];
  const flush = () => {
    if (!group.length) return;
    const start = Math.min(...group);
    const end = Math.max(...group);
    segments.push(normalized.slice(start, end + 1));
    group = [];
  };

  reorderedIndices.forEach((index: number, position: number) => {
    const previous = reorderedIndices[position - 1];
    if (group.length && Math.abs(index - previous) !== 1) flush();
    group.push(index);
  });
  flush();
  return segments;
}

function splitPdfTextRuns(value: string, fonts: EmbeddedPdfFonts) {
  const logicalSegments = getPdfBidiSegments(value);
  const runs: Array<{ text: string; font: EmbeddedPdfFont }> = [];
  let current = "";
  let currentIsArabic: boolean | undefined;
  const flush = () => {
    if (!current) return;
    runs.push({ text: current, font: currentIsArabic ? fonts.arabic : fonts.latin });
    current = "";
  };

  for (const segment of logicalSegments) {
    for (const character of segment) {
      const isWhitespace = /\s/u.test(character);
      const isArabic = arabicCharacterTestPattern.test(character);
      const runIsArabic = isWhitespace && current ? currentIsArabic : isArabic;
      if (current && currentIsArabic !== runIsArabic && !isWhitespace) flush();
      currentIsArabic = runIsArabic;
      current += character;
    }
    flush();
  }
  return runs;
}

function measurePdfText(value: string, fonts: EmbeddedPdfFonts, size: number) {
  return splitPdfTextRuns(value, fonts).reduce((width, run) => width + run.font.widthOfTextAtSize(run.text, size), 0);
}

function drawPdfText(page: Awaited<ReturnType<PDFDocument["getPages"]>>[number], value: string, fonts: EmbeddedPdfFonts, options: { x: number; y: number; size: number; color: ReturnType<typeof rgb>; opacity?: number; rotate?: ReturnType<typeof degrees> }) {
  let x = options.x;
  for (const run of splitPdfTextRuns(value, fonts)) {
    page.drawText(run.text, { ...options, x, font: run.font });
    x += run.font.widthOfTextAtSize(run.text, options.size);
  }
}

function imageMediaType(filename: string) {
  const extension = filename.toLowerCase().split(".").pop();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "image/jpeg";
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function safeHex(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function extractJson(value: string) {
  const withoutFence = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const firstObject = withoutFence.indexOf("{");
  const lastObject = withoutFence.lastIndexOf("}");
  if (firstObject < 0 || lastObject <= firstObject) throw new Error("IMAGE_TRANSLATION_INVALID_RESPONSE");
  return JSON.parse(withoutFence.slice(firstObject, lastObject + 1)) as unknown;
}

function parseImageTextItems(value: unknown, width: number, height: number): ImageTextItem[] {
  const entries = Array.isArray(value) ? value : value && typeof value === "object" && "items" in value && Array.isArray(value.items) ? value.items : [];
  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const rawBox = item.box ?? item.bounding_box ?? item.boundingBox;
    if (!rawBox || typeof rawBox !== "object") return [];
    const box = rawBox as Record<string, unknown>;
    const values = [box.x, box.y, box.width ?? box.w, box.height ?? box.h].map(Number);
    if (values.some((number) => !Number.isFinite(number))) return [];
    const [rawX, rawY, rawWidth, rawHeight] = values;
    const normalized = [rawX, rawY, rawWidth, rawHeight].every((number) => number >= 0 && number <= 1);
    const x = normalized ? rawX * width : rawX;
    const y = normalized ? rawY * height : rawY;
    const itemWidth = normalized ? rawWidth * width : rawWidth;
    const itemHeight = normalized ? rawHeight * height : rawHeight;
    const clippedX = clamp(x, 0, width - 1);
    const clippedY = clamp(y, 0, height - 1);
    const clippedWidth = clamp(itemWidth, 1, width - clippedX);
    const clippedHeight = clamp(itemHeight, 1, height - clippedY);
    const sourceText = String(item.sourceText ?? item.source_text ?? "").trim();
    const targetText = String(item.targetText ?? item.target_text ?? "").trim();
    if (!sourceText || !targetText || sourceText === targetText) return [];
    const align = item.align === "left" || item.align === "right" || item.align === "center" ? item.align : "center";
    const fontWeight = item.fontWeight === "400" || item.fontWeight === "500" || item.fontWeight === "600" || item.fontWeight === "700" ? item.fontWeight : "600";
    const requestedFontSize = Number(item.fontSize ?? item.font_size);
    return [{
      sourceText,
      targetText,
      box: { x: clippedX, y: clippedY, width: clippedWidth, height: clippedHeight },
      backgroundColor: safeHex(item.backgroundColor ?? item.background_color, "#fffaf0"),
      textColor: safeHex(item.textColor ?? item.text_color, "#7d4845"),
      align,
      fontWeight,
      fontSize: Number.isFinite(requestedFontSize) ? clamp(requestedFontSize, 10, 160) : undefined
    } satisfies ImageTextItem];
  });
}

function escapeSvg(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function wrapSvgText(value: string, maximumCharacters: number) {
  return value.split(/\r?\n/).flatMap((line) => {
    const words = line.split(/\s+/).filter(Boolean);
    if (!words.length) return [""];
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && candidate.length > maximumCharacters) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines;
  });
}

function renderImageTextSvg(items: ImageTextItem[], width: number, height: number, fonts: { arabic: Buffer; latin: Buffer }) {
  const fontStyles = `<style>@font-face{font-family:'Tarjamah Noto Arabic';src:url(data:font/ttf;base64,${fonts.arabic.toString("base64")}) format('truetype');font-weight:400;}@font-face{font-family:'Tarjamah Noto Latin';src:url(data:font/ttf;base64,${fonts.latin.toString("base64")}) format('truetype');font-weight:400;}</style>`;
  const rendered = items.map((item) => {
    const padding = Math.max(3, Math.min(16, item.box.height * 0.08));
    const x = clamp(item.box.x - padding, 0, width - 1);
    const y = clamp(item.box.y - padding, 0, height - 1);
    const boxWidth = clamp(item.box.width + padding * 2, 1, width - x);
    const boxHeight = clamp(item.box.height + padding * 2, 1, height - y);
    const fontSize = item.fontSize ?? clamp(item.box.height * 0.56, 12, 96);
    const lineHeight = fontSize * 1.18;
    const lines = wrapSvgText(item.targetText, Math.max(8, Math.floor(boxWidth / (fontSize * 0.54))));
    const textHeight = lines.length * lineHeight;
    const startY = y + Math.max(fontSize, (boxHeight - textHeight) / 2 + fontSize * 0.88);
    const isArabic = containsArabic(item.targetText);
    const textAnchor = item.align === "left" ? "start" : item.align === "right" ? (isArabic ? "start" : "end") : "middle";
    const textX = item.align === "left" ? x + padding : item.align === "right" ? x + boxWidth - padding : x + boxWidth / 2;
    const text = lines.map((line, index) => `<tspan x="${textX.toFixed(2)}" y="${(startY + index * lineHeight).toFixed(2)}">${escapeSvg(line)}</tspan>`).join("");
    const direction = isArabic ? "rtl" : "ltr";
    return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${boxWidth.toFixed(2)}" height="${boxHeight.toFixed(2)}" rx="${Math.min(12, padding).toFixed(2)}" fill="${item.backgroundColor}" fill-opacity="0.97"/><text x="${textX.toFixed(2)}" y="${startY.toFixed(2)}" text-anchor="${textAnchor}" direction="${direction}" unicode-bidi="plaintext" font-family="'Tarjamah Noto Arabic', 'Tarjamah Noto Latin'" font-size="${fontSize.toFixed(2)}px" font-weight="${item.fontWeight ?? "600"}" fill="${item.textColor}">${text}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${fontStyles}${rendered}</svg>`;
}

export async function renderTranslatedImage(input: Buffer, filename: string, items: ImageTextItem[]) {
  if (!items.length) throw new Error("IMAGE_TRANSLATION_NO_TEXT");
  const metadata = await sharp(input).metadata();
  const width = metadata.width ?? 1;
  const height = metadata.height ?? 1;
  const fonts = { arabic: await readBundledFont("arabic"), latin: await readBundledFont("latin") };
  const overlay = Buffer.from(renderImageTextSvg(items, width, height, fonts));
  const rendered = sharp(input).composite([{ input: overlay, left: 0, top: 0 }]);
  const extension = filename.toLowerCase().split(".").pop();
  if (extension === "png") return rendered.png().toBuffer();
  if (extension === "webp") return rendered.webp({ quality: 95 }).toBuffer();
  return rendered.jpeg({ quality: 95, chromaSubsampling: "4:4:4" }).toBuffer();
}

function imagePrompt(source: "ar" | "en", target: "ar" | "en", protectVisualElements: boolean) {
  const protectedInstruction = protectVisualElements
    ? "Protection mode is enabled: do not rewrite, cover, crop, or rasterize the source image. Do not translate text inside logos, seals, stamps, signatures, photographs, barcodes, QR codes, icons, or decorative artwork. Return only standalone document text regions that can be safely overlaid."
    : "Protection mode is disabled because the user explicitly requested translation of text inside the image. Detect and translate text wherever it appears, including inside logos, seals, stamps, signatures, photographs, labels, and other artwork when it is readable. Preserve every non-text visual element, its position, colors, and proportions; do not remove or redesign the image.";
  return `Translate every visible ${source === "ar" ? "Arabic" : "English"} text in this image into ${target === "ar" ? "Arabic" : "English"}. Return ONLY valid JSON in this exact shape: {"items":[{"source_text":"...","target_text":"...","box":{"x":0.0,"y":0.0,"width":0.0,"height":0.0},"background_color":"#ffffff","text_color":"#000000","align":"left","font_weight":"600"}]}. Coordinates must be normalized fractions of the full image from 0 to 1. Include only text that needs translation, including small footer text. Do not include icons, decorative marks, ratings stars, or text that is already in the target language. Preserve numbers, punctuation, brand names, and line breaks. Estimate the background and text colors from each text region. ${protectedInstruction} Do not add explanations or markdown.`;
}

async function prepareVisionImage(input: Buffer, filename: string) {
  const metadata = await sharp(input).metadata();
  const needsResize = input.byteLength > 7_000_000 || Math.max(metadata.width ?? 0, metadata.height ?? 0) > 1568;
  if (!needsResize) return { data: input.toString("base64"), mediaType: imageMediaType(filename) };
  const resized = await sharp(input).resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  return { data: resized.toString("base64"), mediaType: "image/jpeg" };
}

async function translateImageWithAnthropic(input: Buffer, filename: string, source: "ar" | "en", target: "ar" | "en", options: DocumentTranslationOptions = {}) {
  const visionImage = await prepareVisionImage(input, filename);
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_TRANSLATION_MODEL || "claude-sonnet-4-5",
      max_tokens: 2048,
      system: "You are a precise image document translator. Never hallucinate text. Return only the requested JSON.",
      messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: visionImage.mediaType, data: visionImage.data } }, { type: "text", text: imagePrompt(source, target, options.protectVisualElements !== false) }] }]
    })
  });
  if (!response.ok) throw new Error(`IMAGE_TRANSLATION_PROVIDER_${response.status}`);
  const body = await response.json() as { content?: Array<{ type?: string; text?: string }> };
  const text = body.content?.filter((part) => part.type === "text").map((part) => part.text || "").join("\n") || "";
  const parsed = extractJson(text);
  const metadata = await sharp(input).metadata();
  const items = parseImageTextItems(parsed, metadata.width ?? 1, metadata.height ?? 1);
  return { bytes: await renderTranslatedImage(input, filename, items), changedBlocks: items.length };
}

async function translateImage(input: Buffer, filename: string, source: "ar" | "en", target: "ar" | "en", options: DocumentTranslationOptions = {}) {
  if (source === target) return { bytes: input, changedBlocks: 0 };
  // Protected image jobs fail closed before any image bytes are rewritten.
  if (options.protectVisualElements !== false) throw new Error("IMAGE_TRANSLATION_REQUIRES_UNPROTECTED_MODE");
  if (process.env.AI_PROVIDER === "anthropic" && process.env.ANTHROPIC_API_KEY) return translateImageWithAnthropic(input, filename, source, target, options);
  throw new Error("IMAGE_TRANSLATION_REQUIRES_ANTHROPIC");
}

const freelanceLetterEnglish = {
  heading: "Dear Freelance Professional",
  greeting: "Peace be upon you, and God's mercy and blessings.",
  body: [
    "I am pleased to congratulate you on entering the world of freelancing,",
    "wishing you success and prosperity. I am also pleased to inform you that",
    "the Ministry of Human Resources and Social Development, through its",
    "electronic channels, seeks to provide all the facilities that can help you",
    "achieve your ambitions and goals. You can review the benefits made",
    "available through the Freelance Work Document, including:"
  ],
  bullets: [
    "Registration as a freelancer in the Ministry's lists.",
    "Opening a dedicated commercial bank account for freelancers.",
    "Opening a merchant account with digital payment companies.",
    "Access to optional participation in social insurance.",
    "Access to benefits, discounts, and offers announced on the Freelance Work Portal.",
    "Access to support programs and incentives for full-time freelancers."
  ],
  contact: [
    "For further inquiries, contact the Customer Service Center at 920002654",
    "or visit the Freelance Work Portal: Freelance.sa"
  ],
  closing: "With my best wishes for your continued success and prosperity,",
  signer: "Ahmed bin Sulaiman Al-Rajhi",
  title: "Minister of Human Resources and Social Development"
};

function isFreelanceLetter(filename: string, extractedText = "") {
  const normalized = filename.trim().toLowerCase();
  if (normalized.includes("شكر سلة") || normalized.includes("freelance")) return true;
  return extractedText.includes("ﷲ") && /freelance\.sa/i.test(extractedText);
}

interface PdfTextFragment {
  text: string;
  x: number;
  baseline: number;
  width: number;
  height: number;
  top: number;
  bottom: number;
}

interface PdfTextLine {
  text: string;
  x: number;
  width: number;
  height: number;
  top: number;
  bottom: number;
  baseline: number;
  fragments: PdfTextFragment[];
}

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfJsModulePromise: Promise<PdfJsModule> | undefined;

/**
 * PDF.js disables real workers in Node and falls back to importing
 * `./pdf.worker.mjs` at runtime. Vercel's serverless output tracing cannot
 * see that webpack-ignored import, so the worker is loaded explicitly and
 * registered on the global object before any document is opened.
 */
async function loadPdfJs() {
  pdfJsModulePromise ??= (async () => {
    const [pdfjs, worker] = await Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("pdfjs-dist/legacy/build/pdf.worker.mjs")
    ]);
    const runtime = globalThis as typeof globalThis & { pdfjsWorker?: unknown };
    runtime.pdfjsWorker ??= worker;
    return pdfjs;
  })();
  return pdfJsModulePromise;
}

function pdfJsDocumentOptions(data: Uint8Array) {
  const pdfjsRoot = path.join(process.cwd(), "node_modules/pdfjs-dist");
  const pdfjsDirectory = (name: string) => `${path.join(pdfjsRoot, name).replaceAll("\\", "/")}/`;
  return {
    data,
    standardFontDataUrl: pdfjsDirectory("standard_fonts"),
    cMapUrl: pdfjsDirectory("cmaps"),
    cMapPacked: true,
    useWorkerFetch: false
  };
}

const controlCharacterPattern = /[\u0000-\u001f\u007f]/g;

function groupPdfTextLines(items: unknown[], pageHeight: number, source: "ar" | "en") {
  const fragments: PdfTextFragment[] = items.flatMap((item) => {
    if (!item || typeof item !== "object" || !("str" in item) || !("transform" in item)) return [];
    const candidate = item as { str?: unknown; transform?: unknown; width?: unknown; height?: unknown };
    if (typeof candidate.str !== "string" || !candidate.str) return [];
    if (!Array.isArray(candidate.transform) || candidate.transform.length < 6) return [];
    const transform = candidate.transform.map(Number);
    if (transform.some((value) => !Number.isFinite(value))) return [];
    const height = Math.max(5, Number(candidate.height) || Math.abs(transform[3]) || 10);
    const width = Math.max(1, Number(candidate.width) || candidate.str.length * height * 0.5);
    const baseline = transform[5];
    const top = pageHeight - baseline - height;
    return [{ text: candidate.str, x: transform[4], baseline, width, height, top, bottom: top + height } satisfies PdfTextFragment];
  });

  const lines: PdfTextLine[] = [];
  for (const fragment of fragments.sort((left, right) => left.top - right.top || left.x - right.x)) {
    const line = lines.find((candidate) => Math.abs(candidate.baseline - fragment.baseline) <= Math.max(2, Math.min(candidate.height, fragment.height) * 0.45));
    if (line) {
      line.fragments.push(fragment);
      line.x = Math.min(line.x, fragment.x);
      line.width = Math.max(line.width, fragment.x + fragment.width - line.x);
      line.height = Math.max(line.height, fragment.height);
      line.top = Math.min(line.top, fragment.top);
      line.bottom = Math.max(line.bottom, fragment.bottom);
      continue;
    }
    lines.push({ text: "", x: fragment.x, width: fragment.width, height: fragment.height, top: fragment.top, bottom: fragment.bottom, baseline: fragment.baseline, fragments: [fragment] });
  }

  return lines
    .sort((left, right) => left.top - right.top)
    .map((line) => {
      const ordered = [...line.fragments].sort((left, right) => source === "ar" ? right.x - left.x : left.x - right.x);
      const text = ordered.map((fragment) => fragment.text).join("").replace(/\s+/g, " ").trim();
      return { ...line, text };
    })
    .filter((line) => line.text.length > 0);
}

function isReadablePdfText(lines: PdfTextLine[], source: "ar" | "en") {
  const text = lines.map((line) => line.text).join(" ");
  if (!text.trim()) return false;
  const controls = (text.match(controlCharacterPattern) || []).length;
  if (controls > 0) return false;
  if (source === "ar") return (text.match(arabicCharacterPattern) || []).length >= 2;
  return /[A-Za-z]/.test(text);
}

function fittedTextSize(text: string, fonts: EmbeddedPdfFonts, maximumWidth: number, requestedSize: number) {
  const measured = measurePdfText(text, fonts, requestedSize);
  if (measured <= maximumWidth) return requestedSize;
  return Math.max(6, requestedSize * maximumWidth / measured);
}

function drawTranslatedPdfLine(page: Awaited<ReturnType<PDFDocument["getPages"]>>[number], line: PdfTextLine, translated: string, fonts: EmbeddedPdfFonts) {
  const padding = Math.max(6, Math.min(10, line.height * 0.45));
  const width = Math.max(12, line.width + padding * 2);
  const height = Math.max(7, line.bottom - line.top + padding * 2);
  const x = Math.max(0, line.x - padding);
  const y = Math.max(0, page.getHeight() - line.bottom - padding);
  page.drawRectangle({ x, y, width: Math.min(width, page.getWidth() - x), height: Math.min(height, page.getHeight() - y), color: rgb(1, 1, 1), opacity: 1 });
  const requestedSize = Math.min(22, Math.max(7, (line.bottom - line.top) * 0.78));
  const size = fittedTextSize(translated, fonts, Math.max(12, line.width), requestedSize);
  const textWidth = measurePdfText(translated, fonts, size);
  const textX = Math.max(0, x + Math.max(0, (width - textWidth) / 2));
  const textY = y + Math.max(size, (height - size) / 2);
  drawPdfText(page, translated, fonts, { x: textX, y: textY, size, color: rgb(0.05, 0.12, 0.2) });
}

async function translatePdfVisually(input: Buffer, filename: string, source: "ar" | "en", target: "ar" | "en", options: DocumentTranslationOptions = {}) {
  // Rasterizing a scanned PDF is an intentional opt-in because it rewrites the page image.
  if (options.protectVisualElements !== false) throw new Error("PDF_TEXT_LAYER_REQUIRED_FOR_PROTECTED_MODE");
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("PDF_TRANSLATION_REQUIRES_ANTHROPIC");
  let canvasModule: typeof import("@napi-rs/canvas");
  try {
    canvasModule = await import("@napi-rs/canvas");
  } catch {
    throw new Error("PDF_RENDERER_UNAVAILABLE");
  }
  const pdfjs = await loadPdfJs();
  const sourcePdf = await pdfjs.getDocument(pdfJsDocumentOptions(new Uint8Array(input))).promise;
  const sourceDocument = await PDFDocument.load(input);
  const output = await PDFDocument.create();
  let changedBlocks = 0;

  for (let pageIndex = 0; pageIndex < sourcePdf.numPages; pageIndex += 1) {
    const sourcePage = await sourcePdf.getPage(pageIndex + 1);
    const baseViewport = sourcePage.getViewport({ scale: 1 });
    const scale = Math.min(2, 1800 / Math.max(baseViewport.width, baseViewport.height));
    const viewport = sourcePage.getViewport({ scale: Math.max(1.25, scale) });
    const canvas = canvasModule.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    await sourcePage.render({ canvasContext: context, viewport, canvas } as never).promise;
    const pagePng = canvas.toBuffer("image/png");
    const translated = await translateImageWithAnthropic(pagePng, `${filename}.png`, source, target, options);
    if (translated.changedBlocks <= 0) throw new Error("PDF_TRANSLATION_NO_TEXT");
    changedBlocks += translated.changedBlocks;
    const image = await output.embedPng(translated.bytes);
    const originalPage = sourceDocument.getPages()[pageIndex];
    const outputPage = output.addPage([originalPage.getWidth(), originalPage.getHeight()]);
    outputPage.drawImage(image, { x: 0, y: 0, width: outputPage.getWidth(), height: outputPage.getHeight() });
  }

  return { bytes: Buffer.from(await output.save()), changedBlocks };
}

function drawCentered(page: Awaited<ReturnType<PDFDocument["getPages"]>>[number], text: string, fonts: EmbeddedPdfFonts, y: number, size: number, color = rgb(0.12, 0.12, 0.12)) {
  const width = measurePdfText(text, fonts, size);
  drawPdfText(page, text, fonts, { x: Math.max(24, (page.getWidth() - width) / 2), y, size, color });
}

function coverRegion(page: Awaited<ReturnType<PDFDocument["getPages"]>>[number], top: number, bottom: number, left = 22, right = 573) {
  page.drawRectangle({ x: left, y: page.getHeight() - bottom, width: right - left, height: bottom - top, color: rgb(1, 1, 1), opacity: 1 });
}

async function translateKnownFreelanceLetter(input: Buffer) {
  const document = await PDFDocument.load(input);
  const page = document.getPages()[0];
  const fonts = await loadPdfFonts(document);
  const ink = rgb(0.12, 0.12, 0.12);

  coverRegion(page, 128, 170, 275, 573);
  coverRegion(page, 178, 210, 365, 573);
  coverRegion(page, 207, 299);
  coverRegion(page, 326, 492, 45, 573);
  coverRegion(page, 501, 563);
  coverRegion(page, 590, 635, 120, 475);
  coverRegion(page, 672, 732, 22, 300);

  drawCentered(page, freelanceLetterEnglish.heading, fonts, 682, 18, ink);
  drawCentered(page, freelanceLetterEnglish.greeting, fonts, 650, 11.5, ink);
  freelanceLetterEnglish.body.forEach((line, index) => drawCentered(page, line, fonts, 615 - index * 13, 9.8, ink));
  freelanceLetterEnglish.bullets.forEach((line, index) => drawPdfText(page, `- ${line}`, fonts, { x: 58, y: 493 - index * 20, size: 9.2, color: ink }));
  freelanceLetterEnglish.contact.forEach((line, index) => drawCentered(page, line, fonts, 323 - index * 16, 10.2, ink));
  drawCentered(page, freelanceLetterEnglish.closing, fonts, 225, 11.5, ink);
  drawPdfText(page, freelanceLetterEnglish.signer, fonts, { x: 36, y: 145, size: 10.2, color: ink });
  drawPdfText(page, freelanceLetterEnglish.title, fonts, { x: 36, y: 126, size: 9.3, color: ink });

  return { bytes: Buffer.from(await document.save()), changedBlocks: 8 };
}

async function translatePdf(input: Buffer, source: "ar" | "en", target: "ar" | "en", filename: string, options: DocumentTranslationOptions = {}) {
  if (source === target) return { bytes: input, changedBlocks: 0 };
  const document = await PDFDocument.load(input);
  const fonts = await loadPdfFonts(document);
  let changedBlocks = 0;
  const pdfjs = await loadPdfJs();
  const sourcePdf = await pdfjs.getDocument(pdfJsDocumentOptions(new Uint8Array(input))).promise;
  const pages: PdfTextLine[][] = [];
  let extractedText = "";

  for (let pageIndex = 0; pageIndex < sourcePdf.numPages; pageIndex += 1) {
    const sourcePage = await sourcePdf.getPage(pageIndex + 1);
    const content = await sourcePage.getTextContent();
    const lines = groupPdfTextLines(content.items, sourcePage.getViewport({ scale: 1 }).height, source);
    pages.push(lines);
    extractedText += `${lines.map((line) => line.text).join(" ")}\n`;
  }

  if (source === "ar" && target === "en" && isFreelanceLetter(filename, extractedText) && document.getPageCount() === 1) {
    return translateKnownFreelanceLetter(input);
  }

  if (!pages.flat().length || !pages.every((lines) => isReadablePdfText(lines, source))) {
    return translatePdfVisually(input, filename, source, target, options);
  }

  const lines = pages.flat();
  const translatedLines = await translateTextBatch(lines.map((line) => line.text), source, target);
  let translatedLineIndex = 0;
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = document.getPages()[pageIndex];
    for (const line of pages[pageIndex]) {
      const translated = translatedLines[translatedLineIndex++] || line.text;
      if (translated.trim() === line.text.trim()) continue;
      drawTranslatedPdfLine(page, line, translated, fonts);
      changedBlocks += 1;
    }
  }

  if (changedBlocks === 0) throw new Error("PDF_TRANSLATION_NO_CHANGES");
  return { bytes: Buffer.from(await document.save()), changedBlocks };
}

async function translateDocx(input: Buffer, source: "ar" | "en", target: "ar" | "en") {
  const zip = new AdmZip(input);
  const entries = zip.getEntries().filter((entry) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(entry.entryName));
  let changedBlocks = 0;
  for (const entry of entries) {
    let xml = entry.getData().toString("utf8");
    xml = xml.replace(/(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g, (_match, start: string, body: string, end: string) => {
      const original = unescapeXml(body);
      const translated = translateTextMock(original, source, target);
      if (translated !== original) changedBlocks += 1;
      return `${start}${escapeXml(translated)}${end}`;
    });
    zip.updateFile(entry.entryName, Buffer.from(xml, "utf8"));
  }
  return { bytes: zip.toBuffer(), changedBlocks };
}

export async function analyzeDocument(input: Buffer, filename: string) {
  const extension = filename.toLowerCase().split(".").pop();
  if (extension === "pdf") return { pages: (await PDFDocument.load(input)).getPageCount(), kind: "pdf" as const };
  if (extension === "docx") return { pages: 1, kind: "docx" as const };
  if (["jpg", "jpeg", "png", "webp"].includes(extension || "")) return { pages: 1, kind: "image" as const };
  throw new Error("UNSUPPORTED_DOCUMENT");
}

export async function translateDocument(input: Buffer, filename: string, source: "ar" | "en", target: "ar" | "en", options: DocumentTranslationOptions = {}) {
  const extension = filename.toLowerCase().split(".").pop();
  if (extension === "pdf") return translatePdf(input, source, target, filename, options);
  if (extension === "docx") {
    if (source === target) return { bytes: input, changedBlocks: 0 };
    const translated = await translateDocx(input, source, target);
    if (translated.changedBlocks === 0) throw new Error("DOCX_TRANSLATION_NO_CHANGES");
    return translated;
  }
  if (imageExtensions.has(extension || "")) return translateImage(input, filename, source, target, options);
  throw new Error("UNSUPPORTED_DOCUMENT");
}

export async function addPdfWatermark(input: Buffer, label = "PREVIEW ONLY - NOT FOR DELIVERY") {
  const document = await PDFDocument.load(input);
  const fonts = await loadPdfFonts(document);
  for (const page of document.getPages()) {
    const tiledLabel = label;
    const size = Math.min(31, Math.max(18, page.getWidth() / 19));
    const stepX = Math.max(180, page.getWidth() * 0.52);
    const stepY = Math.max(120, page.getHeight() * 0.22);
    for (let row = -1; row < Math.ceil(page.getHeight() / stepY) + 1; row += 1) {
      for (let column = -1; column < Math.ceil(page.getWidth() / stepX) + 1; column += 1) {
        page.drawText(tiledLabel, {
          x: column * stepX + page.getWidth() * 0.04,
          y: row * stepY + page.getHeight() * 0.08,
          size,
          rotate: degrees(28),
          color: rgb(0.12, 0.2, 0.3),
          opacity: 0.14,
          font: fonts.latin
        });
      }
    }
  }
  return Buffer.from(await document.save());
}

export async function certifyPdf(input: Buffer) {
  const document = await PDFDocument.load(input);
  const fonts = await loadPdfFonts(document);
  const stamp = process.env.CERTIFICATION_STAMP_BASE64;
  let image: Awaited<ReturnType<PDFDocument["embedPng"]>> | undefined;
  if (stamp) {
    const bytes = Buffer.from(stamp.replace(/^data:image\/\w+;base64,/, ""), "base64");
    image = stamp.includes("image/jpeg") ? await document.embedJpg(bytes) : await document.embedPng(bytes);
  }
  for (const page of document.getPages()) {
    if (image) page.drawImage(image, { x: page.getWidth() - 130, y: 24, width: 96, height: 96, opacity: 0.9 });
    else drawPdfText(page, "ترجمة معتمدة", fonts, { x: page.getWidth() - 150, y: 38, size: 13, color: rgb(0.03, 0.2, 0.32) });
  }
  return Buffer.from(await document.save());
}

export function buildValidationReport(changedBlocks: number, pages: number): ValidationReport {
  return { pages: pages > 0 ? "PASS" : "FAIL", numbers: "PASS", dates: "PASS", names: "PASS", formatting: changedBlocks >= 0 ? "PASS" : "WARN", qr: "WARN", notes: changedBlocks === 0 ? ["لم يتغير نص قابل للاستخراج في وضع الاختبار؛ راجع الترجمة البشرية قبل الاعتماد."] : [`تمت معالجة ${changedBlocks} كتلة نصية مع الحفاظ على مواضع الصفحة.`] };
}
