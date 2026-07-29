import { readFile, readdir } from "node:fs/promises";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const publicRoot = join(projectRoot, "apps/web/public");
const distRoot = join(projectRoot, "apps/web/dist");
const canonicalSofaNoticePath = join(
  projectRoot,
  "shared/licenses/IAU-SOFA-derived-work-notice.md"
);
const violations = [];

const readText = (root, relativePath) =>
  readFile(join(root, relativePath), "utf8");
const readJson = async (root, relativePath) =>
  JSON.parse(await readText(root, relativePath));

function localPath(reference) {
  const path = reference
    .split(/[?#]/, 1)[0]
    .replace(/^\/+/, "");
  if (path === "") return "index.html";
  const normalized = posix.normalize(path);
  if (normalized === ".." || normalized.startsWith("../")) {
    return null;
  }
  return normalized;
}

async function requireFile(root, relativePath, context) {
  try {
    await readFile(join(root, relativePath));
  } catch {
    violations.push(`${context}: ${relativePath} が存在しません`);
  }
}

try {
  const [
    sourceManifestText,
    distManifestText,
    sourceBootShellCss,
    distBootShellCss,
    sourceHeaders,
    distHeaders,
    manifest,
    indexHtml,
    generatedWrangler,
    assetsIgnore,
    sourceWrangler,
    canonicalSofaNotice,
    distributedSofaNotice
  ] = await Promise.all([
    readText(publicRoot, "manifest.webmanifest"),
    readText(distRoot, "manifest.webmanifest"),
    readText(publicRoot, "boot-shell.css"),
    readText(distRoot, "boot-shell.css"),
    readText(publicRoot, "_headers"),
    readText(distRoot, "_headers"),
    readJson(publicRoot, "manifest.webmanifest"),
    readText(distRoot, "index.html"),
    readJson(distRoot, "wrangler.json"),
    readText(distRoot, ".assetsignore"),
    readText(join(projectRoot, "apps/web"), "wrangler.jsonc"),
    readFile(canonicalSofaNoticePath, "utf8"),
    readText(
      distRoot,
      "licenses/IAU-SOFA-derived-work-notice.md"
    )
  ]);

  if (sourceManifestText !== distManifestText) {
    violations.push(
      "dist/manifest.webmanifest がpublicの最新版と一致しません"
    );
  }
  if (sourceBootShellCss !== distBootShellCss) {
    violations.push(
      "dist/boot-shell.css がpublicの最新版と一致しません"
    );
  }
  if (sourceHeaders !== distHeaders) {
    violations.push("dist/_headers がpublicの最新版と一致しません");
  }
  for (const fragment of [
    "Content-Security-Policy:",
    "/assets/*",
    "Cache-Control: public, max-age=31536000, immutable"
  ]) {
    if (!sourceHeaders.includes(fragment)) {
      violations.push(`public/_headers: ${fragment} が必要です`);
    }
  }
  if (canonicalSofaNotice !== distributedSofaNotice) {
    violations.push(
      "distのIAU SOFA通知がsharedのcanonical版と一致しません"
    );
  }
  const normalizedSofaNotice = canonicalSofaNotice.replace(
    /\s+/g,
    " "
  );
  if (
    !normalizedSofaNotice.includes(
      "Planetarium is not software provided by or endorsed by SOFA"
    ) ||
    !normalizedSofaNotice.includes("1. The Software is owned") ||
    !normalizedSofaNotice.includes(
      "6. The provision of any version of the SOFA software"
    )
  ) {
    violations.push(
      "canonical IAU SOFA通知に非推奨声明または完全な6条件がありません"
    );
  }

  for (const [field, expected] of [
    ["lang", "ja"],
    ["id", "/"],
    ["start_url", "/"],
    ["scope", "/"],
    ["display", "standalone"]
  ]) {
    if (manifest[field] !== expected) {
      violations.push(
        `manifest.webmanifest: ${field} は${JSON.stringify(expected)}が必要です`
      );
    }
  }
  for (const colorField of ["background_color", "theme_color"]) {
    if (!/^#[0-9a-fA-F]{6}$/.test(manifest[colorField] ?? "")) {
      violations.push(
        `manifest.webmanifest: ${colorField} は6桁の16進色で指定してください`
      );
    }
  }
  if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
    violations.push("manifest.webmanifest: iconsが必要です");
  } else {
    for (const [index, icon] of manifest.icons.entries()) {
      const iconPath =
        typeof icon.src === "string" && icon.src.trim() !== ""
          ? localPath(icon.src)
          : null;
      if (
        !iconPath ||
        typeof icon.sizes !== "string" ||
        typeof icon.type !== "string"
      ) {
        violations.push(
          `manifest.webmanifest: icons[${index}]のsrc/sizes/typeが不正です`
        );
        continue;
      }
      await Promise.all([
        requireFile(publicRoot, iconPath, `manifest icons[${index}]`),
        requireFile(distRoot, iconPath, `dist manifest icons[${index}]`)
      ]);
    }
  }

  if (!/<html\s+lang="ja"/.test(indexHtml)) {
    violations.push("dist/index.html: html lang=\"ja\" が必要です");
  }
  const themeColor = indexHtml.match(
    /<meta\s+name="theme-color"\s+content="([^"]+)"/
  )?.[1];
  if (themeColor !== manifest.theme_color) {
    violations.push(
      `dist/index.htmlのtheme-color ${themeColor ?? "なし"}がmanifestと不一致`
    );
  }
  if (!/<link\s+rel="manifest"\s+href="\/manifest\.webmanifest"/.test(indexHtml)) {
    violations.push(
      "dist/index.html: /manifest.webmanifestへのlinkが必要です"
    );
  }
  if (
    !indexHtml.includes("data-boot-shell") ||
    !indexHtml.includes("場所と日時の星空を表示するアプリ") ||
    !indexHtml.includes("東京・現在時刻を準備中") ||
    !indexHtml.includes("表示にはJavaScriptが必要です") ||
    !/<noscript>[\s\S]*href="\/"[\s\S]*再読み込み[\s\S]*<\/noscript>/.test(
      indexHtml
    )
  ) {
    violations.push(
      "dist/index.html: React起動前の目的・初期地点・初期時刻とno-script復旧を示すboot shellが必要です"
    );
  }
  if (
    !/<link\s+rel="stylesheet"\s+href="\/boot-shell\.css"/.test(
      indexHtml
    )
  ) {
    violations.push(
      "dist/index.html: CSP互換の/boot-shell.cssへのlinkが必要です"
    );
  }
  if (
    /<style\b/i.test(indexHtml) ||
    /<[^>]+\sstyle\s*=/i.test(indexHtml)
  ) {
    violations.push(
      "dist/index.html: style-src 'self'と両立しないinline styleを使用できません"
    );
  }
  for (const scriptTag of indexHtml.matchAll(/<script\b([^>]*)>/gi)) {
    if (!/\bsrc="[^"]+"/i.test(scriptTag[1])) {
      violations.push(
        "dist/index.html: script-src 'self'と両立しないinline scriptを使用できません"
      );
    }
  }

  for (const match of indexHtml.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    const reference = match[1];
    if (
      reference.startsWith("http:") ||
      reference.startsWith("https:")
    ) {
      violations.push(
        `dist/index.html: 外部参照 ${reference} を使用できません`
      );
      continue;
    }
    if (reference.startsWith("data:")) {
      violations.push(
        `dist/index.html: inline data参照 ${reference} を使用できません`
      );
      continue;
    }
    if (reference.startsWith("#")) {
      continue;
    }
    const referencedPath = localPath(reference);
    if (!referencedPath) {
      violations.push(
        `dist/index.html: 配布ルート外の参照 ${reference} を使用できません`
      );
      continue;
    }
    await requireFile(distRoot, referencedPath, "dist/index.html");
    if (referencedPath.startsWith("src/")) {
      violations.push(
        `dist/index.htmlが未ビルドのソース ${referencedPath} を参照しています`
      );
    }
  }

  const sourceCompatibilityDate = sourceWrangler.match(
    /"compatibility_date"\s*:\s*"(\d{4}-\d{2}-\d{2})"/
  )?.[1];
  if (
    generatedWrangler.compatibility_date !== sourceCompatibilityDate ||
    generatedWrangler.assets?.not_found_handling !==
      "single-page-application" ||
    generatedWrangler.assets?.directory !== "."
  ) {
    violations.push(
      "dist/wrangler.jsonがソースのcompatibility_date/SPA assets設定と不一致"
    );
  }
  for (const ignored of [
    "wrangler.json",
    ".dev.vars",
    ".wrangler"
  ]) {
    if (!assetsIgnore.split(/\r?\n/).includes(ignored)) {
      violations.push(`dist/.assetsignore: ${ignored} を除外してください`);
    }
  }

  const distEntries = await readdir(distRoot, { recursive: true });
  for (const entry of distEntries) {
    if (
      /(?:^|\/)\.env(?:\.|$)/.test(entry) ||
      entry.endsWith(".map") ||
      entry.endsWith(".pem") ||
      entry.endsWith(".key")
    ) {
      violations.push(`配備禁止ファイルを検出: ${entry}`);
    }
  }
} catch (error) {
  if (error?.code === "ENOENT") {
    violations.push(
      "apps/web/dist がありません。先にWebをビルドしてください。"
    );
  } else {
    throw error;
  }
}

if (violations.length > 0) {
  console.error(
    "Web成果物検証エラー:\n" +
      violations.map((violation) => `- ${violation}`).join("\n")
  );
  process.exitCode = 1;
} else {
  console.log(
    "Web成果物OK: PWA manifest / 参照先 / headers / Cloudflare SPA設定"
  );
}
