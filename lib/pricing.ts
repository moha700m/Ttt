import { pricingSettings } from "./config";
import type { DocumentType, PricingSettings, ServiceKind } from "./types";

export function quoteOrder(input: { pages: number; documentType: DocumentType; service: ServiceKind; urgent?: boolean }, settings: PricingSettings = pricingSettings) {
  const pages = Math.max(1, Math.ceil(input.pages));
  const multiplier = settings.documentTypeMultiplier[input.documentType] ?? 1;
  const urgency = input.urgent ? settings.urgentMultiplier : 1;
  const translationAmount = Math.max(settings.minimumOrder, Math.round(pages * settings.basePricePerPage * multiplier * urgency));
  const certificationAmount = input.service === "certified"
    ? settings.certificationFeeType === "per_page" ? pages * settings.certificationFee : settings.certificationFee
    : 0;
  const subtotal = translationAmount + certificationAmount;
  const vatAmount = settings.vatEnabled ? Math.round(subtotal * settings.vatRate * 100) / 100 : 0;
  return { pages, translationAmount, certificationAmount, vatAmount, amount: subtotal + vatAmount };
}
