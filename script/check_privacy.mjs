import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const sourceRoots = [
  "apps/web/src",
  "apps/macos/Sources",
  "shared/swift"
];
const sourceExtensions = new Set([".js", ".jsx", ".swift", ".ts", ".tsx"]);
const forbidden = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\s*\(/,
  /\bEventSource\s*\(/,
  /\bnavigator\.sendBeacon\s*\(/,
  /\bWebTransport\s*\(/,
  /\bRTCPeerConnection\s*\(/,
  /\bURLSession\b/,
  /\bNSURLConnection\b/,
  /\bNWConnection\s*\(/
];

async function filesBelow(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? filesBelow(path) : [path];
      })
    );
    return nested.flat();
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

const files = (
  await Promise.all(sourceRoots.map((directory) => filesBelow(join(root, directory))))
)
  .flat()
  .filter((file) => sourceExtensions.has(extname(file)));

const violations = [];
for (const file of files) {
  const source = await readFile(file, "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(source)) {
      violations.push(`${relative(root, file)}: ${pattern}`);
    }
  }
}

const [headers, packageJson, npmrc] = await Promise.all([
  readFile(join(root, "apps/web/public/_headers"), "utf8"),
  readFile(join(root, "package.json"), "utf8").then(JSON.parse),
  readFile(join(root, ".npmrc"), "utf8")
]);
const requiredHeaderFragments = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "Permissions-Policy: geolocation=(self), camera=(), microphone=()",
  "Referrer-Policy: no-referrer",
  "X-Content-Type-Options: nosniff",
  "Cross-Origin-Opener-Policy: same-origin",
  "Cross-Origin-Resource-Policy: same-origin"
];
for (const fragment of requiredHeaderFragments) {
  if (!headers.includes(fragment)) {
    violations.push(`apps/web/public/_headers: ${fragment} が必要です`);
  }
}
for (const unsafeDirective of ["'unsafe-inline'", "'unsafe-eval'"]) {
  if (headers.includes(unsafeDirective)) {
    violations.push(
      `apps/web/public/_headers: ${unsafeDirective} は許可しないでください`
    );
  }
}

if (!/^strict-allow-scripts=true$/m.test(npmrc)) {
  violations.push(
    ".npmrc: 未審査のdependency install scriptを拒否する" +
      "strict-allow-scripts=trueが必要です"
  );
}
const expectedInstallScriptPolicy = new Map([
  ["@ibm/plex-sans-jp", false],
  ["esbuild@0.28.1", true],
  ["fsevents@2.3.3", true],
  ["workerd@1.20260722.1", true]
]);
const actualInstallScriptPolicy = packageJson.allowScripts;
if (
  actualInstallScriptPolicy === null ||
  typeof actualInstallScriptPolicy !== "object" ||
  Array.isArray(actualInstallScriptPolicy)
) {
  violations.push("package.json: allowScripts objectが必要です");
} else {
  for (const [dependency, expected] of expectedInstallScriptPolicy) {
    if (actualInstallScriptPolicy[dependency] !== expected) {
      violations.push(
        `package.json: allowScripts.${dependency} は${expected}が必要です`
      );
    }
  }
  for (const dependency of Object.keys(actualInstallScriptPolicy)) {
    if (!expectedInstallScriptPolicy.has(dependency)) {
      violations.push(
        `package.json: 未監査のinstall script許可 ${dependency} を検出しました`
      );
    }
  }
}

if (violations.length > 0) {
  console.error(
    "プライバシー静的検査エラー:\n" +
      violations.map((item) => `- ${item}`).join("\n")
  );
  process.exitCode = 1;
} else {
  console.log(
    `プライバシー静的検査OK: ${files.length}ソース / ` +
      "外部通信APIなし / dependency install script固定"
  );
}
