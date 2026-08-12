export type ServiceKind = "translation" | "certified";
export type DocumentType = "general" | "medical" | "legal" | "academic";
export type PaymentMethod = "al_rajhi" | "al_bilad" | "arab_national" | "binance";
export type OrderStatus =
  | "uploaded"
  | "analyzing"
  | "quote_ready"
  | "awaiting_translation"
  | "translating"
  | "rendering"
  | "validating"
  | "needs_review"
  | "preview_ready"
  | "awaiting_payment"
  | "awaiting_payment_verification"
  | "payment_verified"
  | "awaiting_certification"
  | "certification_review"
  | "certified"
  | "completed"
  | "failed";

export type FileVersion = "original" | "extracted" | "translated_working" | "translated_preview" | "translated_final" | "certified_final" | "payment_receipt";

export interface StoredFile {
  version: FileVersion;
  storageKey: string;
  filename: string;
  mimeType: string;
  size: number;
  sha256: string;
  createdAt: string;
}

export interface ValidationReport {
  pages: "PASS" | "WARN" | "FAIL";
  numbers: "PASS" | "WARN" | "FAIL";
  dates: "PASS" | "WARN" | "FAIL";
  names: "PASS" | "WARN" | "FAIL";
  formatting: "PASS" | "WARN" | "FAIL";
  qr: "PASS" | "WARN" | "FAIL";
  notes: string[];
}

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  sourceLanguage: "ar" | "en";
  targetLanguage: "ar" | "en";
  service: ServiceKind;
  documentType: DocumentType;
  urgent: boolean;
  protectVisualElements: boolean;
  pages: number;
  amount: number;
  translationAmount: number;
  certificationAmount: number;
  vatAmount: number;
  status: OrderStatus;
  paymentStatus: "unpaid" | "awaiting_payment_verification" | "verified" | "rejected";
  paymentMethod?: PaymentMethod;
  files: StoredFile[];
  validation?: ValidationReport;
  createdAt: string;
  updatedAt: string;
  customerTokenHash: string;
  failureReason?: string;
}

export interface PricingSettings {
  basePricePerPage: number;
  certificationFeeType: "per_page" | "flat";
  certificationFee: number;
  minimumOrder: number;
  urgentMultiplier: number;
  documentTypeMultiplier: Record<DocumentType, number>;
  vatEnabled: boolean;
  vatRate: number;
}

export interface PaymentDetails {
  label: string;
  bank?: string;
  accountHolder?: string;
  iban?: string;
  binanceId?: string;
}
