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

/**
 * McDonald's UK prints a 12-character alphanumeric Food for Thoughts code
 * grouped as XXXX-XXXX-XXXX (for example MKYW-ZM3N-L9VG). Treating it as
 * 12 digits rejected every real UK receipt.
 */
export const SURVEY_CODE_PATTERN = /^[A-Z0-9]{12}$/;

export function isValidSurveyCode(value: string) {
  return SURVEY_CODE_PATTERN.test(normalizeSurveyCode(value));
}

export function formatSurveyCode(value: string) {
  const code = normalizeSurveyCode(value);
  return code.length === 12 ? `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}` : code;
}

export function receiptFingerprint(parts: {
  store: string;
  visitedAt: string | null;
  orderNumber: string;
  total: number | null;
}) {
  return [parts.store.trim().toLowerCase(), parts.visitedAt ?? "", parts.orderNumber.trim().toLowerCase(), parts.total?.toFixed(2) ?? ""].join("|");
}
