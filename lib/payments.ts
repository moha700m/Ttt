import type { PaymentDetails, PaymentMethod } from "./types";

const methods: Record<PaymentMethod, PaymentDetails> = {
  al_rajhi: { label: "مصرف الراجحي", bank: "Al Rajhi Bank", iban: process.env.PAYMENT_AL_RAJHI_IBAN },
  al_bilad: { label: "بنك البلاد", bank: "Bank Al Bilad", accountHolder: process.env.PAYMENT_AL_BILAD_ACCOUNT_HOLDER, iban: process.env.PAYMENT_AL_BILAD_IBAN },
  arab_national: { label: "البنك العربي الوطني", bank: "Arab National Bank", iban: process.env.PAYMENT_ARAB_NATIONAL_IBAN },
  binance: { label: "Binance", binanceId: process.env.PAYMENT_BINANCE_ID }
};

export function getPaymentDetails(method: PaymentMethod) {
  const value = methods[method];
  if (!value) throw new Error("PAYMENT_METHOD_NOT_FOUND");
  return value;
}

export function listPaymentMethods() {
  return Object.entries(methods).map(([id, value]) => ({ id, label: value.label }));
}
