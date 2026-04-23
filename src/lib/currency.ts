// Centralized currency formatting (Philippine Peso).
export const CURRENCY = "PHP";
export const CURRENCY_SYMBOL = "₱";

export const formatPHP = (
  value: number | string | null | undefined,
  opts: Intl.NumberFormatOptions = {},
) => {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
    ...opts,
  }).format(isFinite(n) ? n : 0);
};
