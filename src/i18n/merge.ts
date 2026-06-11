import type { TranslationBundle, TranslationLeaf } from "../games/types";

export function mergeTranslationBundles(...bundles: TranslationBundle[]): TranslationBundle {
  return bundles.reduce<TranslationBundle>((result, bundle) => mergeBundle(result, bundle), {});
}

function mergeBundle(base: TranslationBundle, next: TranslationBundle): TranslationBundle {
  const merged: TranslationBundle = { ...base };

  for (const [key, value] of Object.entries(next)) {
    merged[key] = mergeLeaf(merged[key], value);
  }

  return merged;
}

function mergeLeaf(base: TranslationLeaf | undefined, next: TranslationLeaf): TranslationLeaf {
  if (isBranch(base) && isBranch(next)) return mergeBundle(base, next);
  return next;
}

function isBranch(value: TranslationLeaf | undefined): value is TranslationBundle {
  return Boolean(value && typeof value === "object");
}
