import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const outputRoot = join(projectRoot, "apps/web/dist");
const budget = JSON.parse(
  await readFile(join(projectRoot, "config/web-budgets.json"), "utf8")
);

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(directory, entry.name);
      return entry.isDirectory() ? filesBelow(entryPath) : [entryPath];
    })
  );
  return nested.flat();
}

function localReferencePath(reference, parentPath = "index.html") {
  if (
    reference.startsWith("data:") ||
    reference.startsWith("http:") ||
    reference.startsWith("https:") ||
    reference.startsWith("#")
  ) {
    return null;
  }
  const clean = reference.split(/[?#]/, 1)[0];
  if (clean.startsWith("/")) {
    return clean.replace(/^\/+/, "");
  }
  const resolved = normalize(join(dirname(parentPath), clean));
  return resolved.startsWith("../") ? null : resolved;
}

function referencesFromHtml(source) {
  const references = new Set(["index.html"]);
  for (const match of source.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    const localPath = localReferencePath(match[1], "index.html");
    if (localPath) references.add(localPath);
  }
  return references;
}

function referencesFromCss(source, stylesheetPath) {
  const references = new Set();
  const urlPattern =
    /\burl\(\s*(?:"([^"]+)"|'([^']+)'|([^)'"\s]+))\s*\)/g;
  for (const match of source.matchAll(urlPattern)) {
    const reference = match[1] ?? match[2] ?? match[3];
    if (!reference) continue;
    const localPath = localReferencePath(reference, stylesheetPath);
    if (localPath) references.add(localPath);
  }
  // Vite normally bundles CSS imports, but count quoted @import references
  // too so a future build configuration cannot hide an initial stylesheet
  // (and its fonts) from the transitive budget walk.
  const quotedImportPattern =
    /@import\s+(?:"([^"]+)"|'([^']+)')/g;
  for (const match of source.matchAll(quotedImportPattern)) {
    const reference = match[1] ?? match[2];
    if (!reference) continue;
    const localPath = localReferencePath(reference, stylesheetPath);
    if (localPath) references.add(localPath);
  }
  return references;
}

const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
const overage = (actual, limit) => kib(actual - limit);

function requirePositiveSafeInteger(value, field) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(
      `config/web-budgets.json の${field}は正の安全な整数が必要です`
    );
  }
}

function validateExtensionBudgetMap(value, field) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      `config/web-budgets.json の${field}は拡張子別予算のobjectが必要です`
    );
  }
  for (const [extension, limit] of Object.entries(value)) {
    if (!extension.startsWith(".")) {
      throw new Error(
        `config/web-budgets.json の${field}.${extension}は` +
          "ドットで始まる拡張子が必要です"
      );
    }
    requirePositiveSafeInteger(limit, `${field}.${extension}`);
  }
}

try {
  if (budget.schemaVersion !== 1) {
    throw new Error("config/web-budgets.json のschemaVersionが不正です");
  }
  for (const field of [
    "initialGzipBytes",
    "maxInitialFiles",
    "maxInitialJavaScriptRawBytes",
    "defaultFileGzipBytes",
    "defaultFileRawBytes"
  ]) {
    requirePositiveSafeInteger(budget[field], field);
  }
  validateExtensionBudgetMap(
    budget.perExtensionGzipBytes,
    "perExtensionGzipBytes"
  );
  validateExtensionBudgetMap(
    budget.perExtensionRawBytes,
    "perExtensionRawBytes"
  );

  const allFiles = await filesBelow(outputRoot);
  const byRelativePath = new Map(
    allFiles.map((file) => [relative(outputRoot, file), file])
  );
  const html = await readFile(join(outputRoot, "index.html"), "utf8");
  const initialPaths = referencesFromHtml(html);
  const cssReferencedPaths = new Set();
  const pendingStylesheets = [...initialPaths].filter(
    (initialPath) => extname(initialPath) === ".css"
  );
  while (pendingStylesheets.length > 0) {
    const stylesheetPath = pendingStylesheets.pop();
    if (!stylesheetPath || !byRelativePath.has(stylesheetPath)) {
      continue;
    }
    const stylesheet = await readFile(
      join(outputRoot, stylesheetPath),
      "utf8"
    );
    for (const referencedPath of referencesFromCss(
      stylesheet,
      stylesheetPath
    )) {
      cssReferencedPaths.add(referencedPath);
      if (initialPaths.has(referencedPath)) continue;
      initialPaths.add(referencedPath);
      if (extname(referencedPath) === ".css") {
        pendingStylesheets.push(referencedPath);
      }
    }
  }
  const violations = [];
  for (const initialPath of initialPaths) {
    if (!byRelativePath.has(initialPath)) {
      violations.push(
        `存在しない初期アセット ${initialPath} が参照されています`
      );
    }
  }
  const lazyHelpContracts = [
    {
      expectedCount: 1,
      label: "ヘルプJavaScript",
      pattern: /^assets\/HelpDialog-[A-Za-z0-9_-]+\.js$/
    },
    {
      expectedCount: 1,
      label: "ヘルプCSS",
      pattern: /^assets\/HelpDialog-[A-Za-z0-9_-]+\.css$/
    },
    {
      expectedCount: 2,
      label: "ヘルプ専用フォント",
      pattern:
        /^assets\/PlanetariumSansJP-Help-(?:Regular|SemiBold)-[A-Za-z0-9_-]+\.woff2$/
    }
  ];
  for (const contract of lazyHelpContracts) {
    const matches = [...byRelativePath.keys()].filter((path) =>
      contract.pattern.test(path)
    );
    if (matches.length !== contract.expectedCount) {
      violations.push(
        `${contract.label}は遅延成果物${contract.expectedCount}件が必要です` +
          `（実際: ${matches.length}件）`
      );
    }
    for (const match of matches) {
      if (initialPaths.has(match)) {
        violations.push(
          `${contract.label} ${match} を初期アセットへ含めないでください`
        );
      }
    }
  }

  const sizes = await Promise.all(
    allFiles.map(async (file) => {
      const source = await readFile(file);
      return {
        file: relative(outputRoot, file),
        raw: (await stat(file)).size,
        gzip: gzipSync(source, { level: 9 }).byteLength
      };
    })
  );
  const sizesByPath = new Map(sizes.map((item) => [item.file, item]));
  const initialSizes = [...initialPaths]
    .map((initialPath) => sizesByPath.get(initialPath))
    .filter((item) => item !== undefined);
  const initialGzip = initialSizes.reduce(
    (sum, item) => sum + item.gzip,
    0
  );
  const cssReferencedFonts = initialSizes.filter(
    (item) =>
      cssReferencedPaths.has(item.file) &&
      extname(item.file) === ".woff2"
  );
  const cssReferencedFontGzip = cssReferencedFonts.reduce(
    (sum, item) => sum + item.gzip,
    0
  );

  if (initialGzip > budget.initialGzipBytes) {
    violations.push(
      `初期アセットgzip合計 ${kib(initialGzip)} が上限` +
        `${kib(budget.initialGzipBytes)}を${overage(
          initialGzip,
          budget.initialGzipBytes
        )}超過`
    );
  }
  if (initialSizes.length > budget.maxInitialFiles) {
    violations.push(
      `初期アセット${initialSizes.length}ファイルが上限` +
        `${budget.maxInitialFiles}を超過`
    );
  }
  const largestInitialJavaScript = initialSizes
    .filter((item) => extname(item.file) === ".js")
    .sort((a, b) => b.raw - a.raw)[0];
  if (
    largestInitialJavaScript &&
    largestInitialJavaScript.raw >
      budget.maxInitialJavaScriptRawBytes
  ) {
    violations.push(
      `最大初期JavaScript ${largestInitialJavaScript.file} raw ` +
        `${kib(largestInitialJavaScript.raw)} が起動上限` +
        `${kib(budget.maxInitialJavaScriptRawBytes)}を` +
        `${overage(
          largestInitialJavaScript.raw,
          budget.maxInitialJavaScriptRawBytes
        )}超過`
    );
  }

  for (const item of sizes) {
    const extension = extname(item.file);
    const gzipLimit =
      budget.perExtensionGzipBytes[extension] ??
      budget.defaultFileGzipBytes;
    const rawLimit =
      budget.perExtensionRawBytes[extension] ??
      budget.defaultFileRawBytes;
    if (item.gzip > gzipLimit) {
      violations.push(
        `${item.file} gzip ${kib(item.gzip)} が${extension || "既定"}上限` +
          `${kib(gzipLimit)}を${overage(item.gzip, gzipLimit)}超過`
      );
    }
    if (item.raw > rawLimit) {
      violations.push(
        `${item.file} raw ${kib(item.raw)} が${extension || "既定"}上限` +
          `${kib(rawLimit)}を${overage(item.raw, rawLimit)}超過`
      );
    }
  }

  console.log(
    `Web初期アセット: ${kib(initialGzip)} / ` +
      `${kib(budget.initialGzipBytes)} gzip上限 / ` +
      `${initialSizes.length}ファイル`
  );
  console.log(
    `CSS経由の初期WOFF2: ${cssReferencedFonts.length}ファイル / ` +
      `${kib(cssReferencedFontGzip)} gzip（初期合計に算入）`
  );
  if (largestInitialJavaScript) {
    console.log(
      `最大初期JavaScript: ${largestInitialJavaScript.file} ` +
        `${kib(largestInitialJavaScript.raw)} raw / ` +
        `${kib(budget.maxInitialJavaScriptRawBytes)}上限`
    );
  }
  for (const item of initialSizes.sort((a, b) => b.gzip - a.gzip)) {
    console.log(
      `  ${item.file}: ${kib(item.gzip)} gzip (${kib(item.raw)} raw)`
    );
  }
  console.log(`配備ファイル個別予算: ${sizes.length}ファイル検査`);

  if (violations.length > 0) {
    console.error(
      "Web予算超過:\n" +
        violations.map((violation) => `- ${violation}`).join("\n")
    );
    process.exitCode = 1;
  }
} catch (error) {
  if (error?.code === "ENOENT") {
    console.error("apps/web/dist がありません。先にWebをビルドしてください。");
  } else {
    console.error(error);
  }
  process.exitCode = 1;
}
