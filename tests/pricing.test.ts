import { describe, expect, it } from "vitest";
import { quoteOrder } from "@/lib/pricing";

describe("pricing engine", () => {
  it("calculates flat certification pricing", () => {
    const quote = quoteOrder({ pages: 4, documentType: "general", service: "certified" }, { basePricePerPage: 29, certificationFeeType: "flat", certificationFee: 80, minimumOrder: 49, urgentMultiplier: 1.5, documentTypeMultiplier: { general: 1, medical: 1.2, legal: 1.3, academic: 1.1 }, vatEnabled: false, vatRate: 0 });
    expect(quote.translationAmount).toBe(116); expect(quote.certificationAmount).toBe(80); expect(quote.amount).toBe(196);
  });
  it("applies type and urgency multipliers", () => {
    const quote = quoteOrder({ pages: 2, documentType: "legal", service: "translation", urgent: true });
    expect(quote.amount).toBeGreaterThan(49);
  });
});
