import { readFile } from "node:fs/promises";

const configUrl = new URL("../apps/web/wrangler.jsonc", import.meta.url);
const source = await readFile(configUrl, "utf8");
const violations = [];

const compatibilityDate = source.match(
  /"compatibility_date"\s*:\s*"(\d{4}-\d{2}-\d{2})"/
)?.[1];
if (!compatibilityDate) {
  violations.push("compatibility_date がありません");
} else {
  const todayUtc = new Date().toISOString().slice(0, 10);
  if (compatibilityDate > todayUtc) {
    violations.push(
      `compatibility_date ${compatibilityDate} はUTCの本日 ${todayUtc} より未来です`
    );
  }
}

if (
  !/"not_found_handling"\s*:\s*"single-page-application"/.test(source)
) {
  violations.push(
    "assets.not_found_handling は single-page-application である必要があります"
  );
}

if (violations.length > 0) {
  console.error(
    "Cloudflare設定エラー:\n" +
      violations.map((violation) => `- ${violation}`).join("\n")
  );
  process.exitCode = 1;
} else {
  console.log(
    `Cloudflare設定OK: compatibility_date=${compatibilityDate} / SPA fallback`
  );
}
