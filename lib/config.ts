import type { PricingSettings } from "./types";

export const isTestMode = process.env.ENABLE_TEST_MODE === "true" || !process.env.SUPABASE_URL;

export const pricingSettings: PricingSettings = {
  basePricePerPage: Number(process.env.BASE_PRICE_PER_PAGE || 29),
  certificationFeeType: process.env.CERTIFICATION_FEE_TYPE === "per_page" ? "per_page" : "flat",
  certificationFee: Number(process.env.CERTIFICATION_FEE || 80),
  minimumOrder: Number(process.env.MINIMUM_ORDER || 49),
  urgentMultiplier: Number(process.env.URGENT_MULTIPLIER || 1.5),
  documentTypeMultiplier: { general: 1, medical: 1.2, legal: 1.3, academic: 1.1 },
  vatEnabled: process.env.VAT_ENABLED === "true",
  vatRate: Number(process.env.VAT_RATE || 0)
};

export const publicAppConfig = {
  businessName: process.env.BUSINESS_NAME || "ترجمة",
  freelanceDocumentNumber: process.env.FREELANCE_DOCUMENT_NUMBER || "FL-289426120"
};
