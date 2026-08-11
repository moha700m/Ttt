import { readFile, writeFile } from "node:fs/promises";
import { renderTranslatedImage } from "../lib/document-engine";

async function main() {
const source = await readFile("../upload/690962F5-717B-49A4-B586-066B2B0DF1B0.jpeg");
const output = await renderTranslatedImage(source, "salon.jpeg", [
  { sourceText: "صالون المزن للتزيين النسائي", targetText: "Al Muzn Women's Beauty Salon", box: { x: 0.31, y: 0.32, width: 0.4, height: 0.13 }, backgroundColor: "#fffaf0", textColor: "#7d4845", align: "center", fontWeight: "600" },
  { sourceText: "للتزيين النسائي", targetText: "Women's Beauty", box: { x: 0.39, y: 0.48, width: 0.24, height: 0.1 }, backgroundColor: "#fffaf0", textColor: "#7d4845", align: "center", fontWeight: "500" },
  { sourceText: "الجمال يبدأ من التفاصيل", targetText: "Beauty Begins with the Details", box: { x: 0.35, y: 0.63, width: 0.31, height: 0.08 }, backgroundColor: "#fffaf0", textColor: "#7d4845", align: "center", fontWeight: "500" },
  { sourceText: "حي الخبر الشمالية · الخبر", targetText: "North Al Khobar District · Al Khobar", box: { x: 0.72, y: 0.78, width: 0.27, height: 0.09 }, backgroundColor: "#fffaf0", textColor: "#7d4845", align: "right", fontWeight: "400" }
]);
await writeFile("../translated-salon-preview.jpeg", output);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
