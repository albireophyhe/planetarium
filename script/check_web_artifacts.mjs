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

function pngChunkTypes(buffer) {
  let offset = 8;
  const types = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const nextOffset = offset + 12 + length;
    if (nextOffset > buffer.length) {
      return null;
    }
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    types.push(type);
    offset = nextOffset;
    if (type === "IEND") {
      return offset === buffer.length ? types : null;
    }
  }
  return null;
}

function validateSquarePng(buffer, expectedSize, context) {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
  ]);
  if (
    buffer.length < 26 ||
    !buffer.subarray(0, 8).equals(signature) ||
    buffer.toString("ascii", 12, 16) !== "IHDR"
  ) {
    violations.push(`${context}: PNG形式が不正です`);
    return;
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const colorType = buffer[25];
  const chunkTypes = pngChunkTypes(buffer);
  if (
    !chunkTypes ||
    !chunkTypes.includes("IDAT") ||
    chunkTypes.at(-1) !== "IEND"
  ) {
    violations.push(`${context}: PNG chunk構造が不正です`);
    return;
  }
  if (width !== expectedSize || height !== expectedSize) {
    violations.push(
      `${context}: ${expectedSize}x${expectedSize}pxが必要です`
    );
  }
  if (colorType !== 2 || chunkTypes.includes("tRNS")) {
    violations.push(
      `${context}: OSが任意色で補完しない不透明RGB PNGが必要です`
    );
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
  if (
    ![manifest.name, manifest.short_name].some(
      (value) => typeof value === "string" && value.trim() !== ""
    )
  ) {
    violations.push(
      "manifest.webmanifest: nameまたはshort_nameが必要です"
    );
  }
  if (manifest.prefer_related_applications === true) {
    violations.push(
      "manifest.webmanifest: Web版を直接インストールするためprefer_related_applicationsをtrueにできません"
    );
  }
  for (const colorField of ["background_color", "theme_color"]) {
    if (!/^#[0-9a-fA-F]{6}$/.test(manifest[colorField] ?? "")) {
      violations.push(
        `manifest.webmanifest: ${colorField} は6桁の16進色で指定してください`
      );
    }
  }
  const manifestIcons = Array.isArray(manifest.icons)
    ? manifest.icons
    : [];
  if (manifestIcons.length === 0) {
    violations.push("manifest.webmanifest: iconsが必要です");
  } else {
    for (const [index, icon] of manifestIcons.entries()) {
      const iconPath =
        typeof icon?.src === "string" && icon.src.trim() !== ""
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
  for (const requiredIcon of [
    { path: "icon-192.png", size: 192 },
    { path: "icon-512.png", size: 512 }
  ]) {
    const manifestIcon = manifestIcons.find(
      (icon) =>
        typeof icon?.src === "string" &&
        localPath(icon.src) === requiredIcon.path &&
        icon.sizes ===
          `${requiredIcon.size}x${requiredIcon.size}` &&
        icon.type === "image/png"
    );
    const purposes = new Set(
      typeof manifestIcon?.purpose === "string"
        ? manifestIcon.purpose.split(/\s+/).filter(Boolean)
        : []
    );
    if (
      !manifestIcon ||
      !purposes.has("any") ||
      !purposes.has("maskable")
    ) {
      violations.push(
        `manifest.webmanifest: ${requiredIcon.path}をany/maskable用途で定義してください`
      );
      continue;
    }

    const [sourceIcon, distIcon] = await Promise.all([
      readFile(join(publicRoot, requiredIcon.path)),
      readFile(join(distRoot, requiredIcon.path))
    ]);
    validateSquarePng(
      sourceIcon,
      requiredIcon.size,
      `public/${requiredIcon.path}`
    );
    validateSquarePng(
      distIcon,
      requiredIcon.size,
      `dist/${requiredIcon.path}`
    );
    if (!sourceIcon.equals(distIcon)) {
      violations.push(
        `dist/${requiredIcon.path}がpublicの最新版と一致しません`
      );
    }
  }
  const scalableIcon = manifestIcons.find(
    (icon) =>
      typeof icon?.src === "string" &&
      localPath(icon.src) === "favicon.svg"
  );
  const scalablePurposes = new Set(
    typeof scalableIcon?.purpose === "string"
      ? scalableIcon.purpose.split(/\s+/).filter(Boolean)
      : []
  );
  if (
    !scalableIcon ||
    scalableIcon.sizes !== "any" ||
    scalableIcon.type !== "image/svg+xml" ||
    scalablePurposes.size !== 1 ||
    !scalablePurposes.has("any")
  ) {
    violations.push(
      "manifest.webmanifest: 透明角を持つfavicon.svgはany用途だけにしてください"
    );
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
  const appleTouchLink = indexHtml.match(
    /<link\b[^>]*\brel="apple-touch-icon"[^>]*>/i
  )?.[0];
  if (
    !appleTouchLink ||
    !/\bsizes="180x180"/i.test(appleTouchLink) ||
    !/\bhref="\/apple-touch-icon\.png"/i.test(appleTouchLink)
  ) {
    violations.push(
      "dist/index.html: 180x180の/apple-touch-icon.pngが必要です"
    );
  } else {
    const [sourceTouchIcon, distTouchIcon] = await Promise.all([
      readFile(join(publicRoot, "apple-touch-icon.png")),
      readFile(join(distRoot, "apple-touch-icon.png"))
    ]);
    validateSquarePng(
      sourceTouchIcon,
      180,
      "public/apple-touch-icon.png"
    );
    validateSquarePng(
      distTouchIcon,
      180,
      "dist/apple-touch-icon.png"
    );
    if (!sourceTouchIcon.equals(distTouchIcon)) {
      violations.push(
        "dist/apple-touch-icon.pngがpublicの最新版と一致しません"
      );
    }
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
