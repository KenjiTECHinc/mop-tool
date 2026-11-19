import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../apps/web/src/i18n");
const en = JSON.parse(readFileSync(resolve(root, "en.json"), "utf8"));
const zh = JSON.parse(readFileSync(resolve(root, "zh-TW.json"), "utf8"));

function keys(value, prefix = "") {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key));
  }
  return [prefix];
}

const enKeys = new Set(keys(en));
const zhKeys = new Set(keys(zh));
const missingZh = [...enKeys].filter((key) => !zhKeys.has(key));
const missingEn = [...zhKeys].filter((key) => !enKeys.has(key));

if (missingZh.length || missingEn.length) {
  console.error("i18n key mismatch");
  for (const key of missingZh) console.error(`missing zh-TW: ${key}`);
  for (const key of missingEn) console.error(`missing en: ${key}`);
  process.exit(1);
}

console.log(`i18n ok (${enKeys.size} keys)`);
