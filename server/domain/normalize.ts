const MULTISPACE = /\s+/g;
const NON_WORD = /[^a-z0-9\s]/g;

const aliases = new Map([
  ["big mac meal", "Big Mac Meal"],
  ["bigmac meal", "Big Mac Meal"],
  ["med fries", "Medium Fries"],
  ["medium fries", "Medium Fries"],
  ["coke zero", "Coca-Cola Zero Sugar"],
  ["coca cola zero", "Coca-Cola Zero Sugar"],
  ["cheeseburger", "Cheeseburger"],
]);

export function normalizeItemName(value: string) {
  const clean = value.trim().replace(MULTISPACE, " ");
  const key = clean.toLowerCase().replace(NON_WORD, "").replace(MULTISPACE, " ");
  return aliases.get(key) ?? clean.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function normalizeSurveyCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function receiptFingerprint(parts: {
  store: string;
  visitedAt: string | null;
  orderNumber: string;
  total: number | null;
}) {
  return [parts.store.trim().toLowerCase(), parts.visitedAt ?? "", parts.orderNumber.trim().toLowerCase(), parts.total?.toFixed(2) ?? ""].join("|");
}
