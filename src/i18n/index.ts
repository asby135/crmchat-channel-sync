import { en } from "./en.js";
import { ru } from "./ru.js";

// Widen the type so translated string values are not literal types
export type Locale = {
  [K in keyof typeof en]: (typeof en)[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : string;
};

const locales: Record<string, Locale> = { en, ru };

export function t(languageCode: string | undefined): Locale {
  if (languageCode && languageCode in locales) return locales[languageCode];
  return en; // default to English
}
