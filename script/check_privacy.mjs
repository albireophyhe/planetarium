import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const sourceRoots = [
  "apps/web/src",
  "apps/macos/Sources",
  "shared/swift"
];
const sourceExtensions = new Set([".js", ".jsx", ".swift", ".ts", ".tsx"]);
const auditedEventTransport =
  "apps/web/src/domain/events/eventAssetTransport.ts";
const auditedWebOpenMeteoTransport =
  "apps/web/src/features/settings/openMeteoWeather.ts";
const auditedWebJmaTransport =
  "apps/web/src/features/settings/jmaAmedasWeather.ts";
const auditedMacWeatherFactory =
  "apps/macos/Sources/PlanetariumApp/Services/CurrentWeatherService.swift";
const auditedMacJmaTransport =
  "apps/macos/Sources/PlanetariumApp/Services/JMACurrentWeatherService.swift";
const auditedMacOpenMeteoTransport =
  "apps/macos/Sources/PlanetariumApp/Services/OpenMeteoCurrentWeatherService.swift";
const auditedWebWeatherTransports = new Set([
  auditedWebJmaTransport,
  auditedWebOpenMeteoTransport
]);
const auditedMacWeatherTransports = new Set([
  auditedMacWeatherFactory,
  auditedMacJmaTransport,
  auditedMacOpenMeteoTransport
]);
const fetchPattern = /\bfetch\s*\(/;
const urlSessionPattern = /\bURLSession\b/;
const forbidden = [
  fetchPattern,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\s*\(/,
  /\bEventSource\s*\(/,
  /\bnavigator\.sendBeacon\s*\(/,
  /\bWebTransport\s*\(/,
  /\bRTCPeerConnection\s*\(/,
  urlSessionPattern,
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
  const relativePath = relative(root, file);
  for (const pattern of forbidden) {
    if (
      ((relativePath === auditedEventTransport ||
        auditedWebWeatherTransports.has(relativePath)) &&
        pattern === fetchPattern) ||
      (auditedMacWeatherTransports.has(relativePath) &&
        pattern === urlSessionPattern)
    ) {
      continue;
    }
    if (pattern.test(source)) {
      violations.push(`${relativePath}: ${pattern}`);
    }
  }
}

const webWeatherTransportSource = await readFile(
  join(root, auditedWebOpenMeteoTransport),
  "utf8"
);
const webWeatherCalls = [
  ...webWeatherTransportSource.matchAll(/\bfetcher\s*\(/g)
].length;
for (const required of [
  /const OPEN_METEO_FORECAST_ENDPOINT\s*=\s*["']https:\/\/api\.open-meteo\.com\/v1\/forecast["']/,
  /searchParams\.set\(["']latitude["']/,
  /searchParams\.set\(["']longitude["']/,
  /["']temperature_2m,relative_humidity_2m,surface_pressure["']/,
  /searchParams\.set\(["']timezone["'],\s*["']UTC["']\)/,
  /searchParams\.set\(["']forecast_days["'],\s*["']1["']\)/,
  /MAX_RESPONSE_BYTES\s*=\s*64\s*\*\s*1_024/,
  /MAX_MODEL_CLOCK_DIFFERENCE_MILLISECONDS\s*=\s*60\s*\*\s*60\s*\*\s*1_000/,
  /responseMediaType\(response\)\s*!==\s*["']application\/json["']/,
  /response\.headers\.get\(["']content-length["']\)/,
  /response\.body\.getReader\(\)/,
  /Math\.abs\(now\s*-\s*observedAtMilliseconds\)/,
  /cache:\s*["']no-store["']/,
  /credentials:\s*["']omit["']/,
  /redirect:\s*["']error["']/,
  /referrerPolicy:\s*["']no-referrer["']/,
  /signal:\s*requestController\.signal/
]) {
  if (!required.test(webWeatherTransportSource)) {
    violations.push(
      `${auditedWebOpenMeteoTransport}: 監査済みOpen-Meteo GET契約 ${required} が必要です`
    );
  }
}
const webWeatherOrigins = [
  ...webWeatherTransportSource.matchAll(/https?:\/\/[^\s"']+/g)
].map((match) => match[0]);
if (
  webWeatherCalls !== 1 ||
  webWeatherOrigins.length !== 1 ||
  webWeatherOrigins[0] !==
    "https://api.open-meteo.com/v1/forecast" ||
  /customer-api\.open-meteo\.com|FormData|sendBeacon|WebSocket/.test(
    webWeatherTransportSource
  )
) {
  violations.push(
    `${auditedWebOpenMeteoTransport}: 匿名の固定Open-Meteo GET 1件以外を追加できません`
  );
}

const webJmaTransportSource = await readFile(
  join(root, auditedWebJmaTransport),
  "utf8"
);
const webJmaCalls = [
  ...webJmaTransportSource.matchAll(/\bfetcher\s*\(/g)
].length;
for (const required of [
  /const JMA_AMEDAS_LATEST_TIME_URL\s*=\s*["']https:\/\/www\.jma\.go\.jp\/bosai\/amedas\/data\/latest_time\.txt["'];/,
  /const JMA_AMEDAS_STATION_TABLE_URL\s*=\s*["']https:\/\/www\.jma\.go\.jp\/bosai\/amedas\/const\/amedastable\.json["'];/,
  /const JMA_AMEDAS_MAP_BASE_URL\s*=\s*["']https:\/\/www\.jma\.go\.jp\/bosai\/amedas\/data\/map\/["'];/,
  /MAX_STATION_TABLE_BYTES\s*=\s*512\s*\*\s*1_024/,
  /MAX_MAP_BYTES\s*=\s*1_536\s*\*\s*1_024/,
  /MAX_OBSERVATION_AGE_MILLISECONDS\s*=\s*30\s*\*\s*60\s*\*\s*1_000/,
  /MAX_FUTURE_SKEW_MILLISECONDS\s*=\s*5\s*\*\s*60\s*\*\s*1_000/,
  /MAX_STATION_DISTANCE_KILOMETERS\s*=\s*25/,
  /observationAge\s*>\s*MAX_OBSERVATION_AGE_MILLISECONDS/,
  /observationAge\s*<\s*-MAX_FUTURE_SKEW_MILLISECONDS/,
  /quality\s*!==\s*0/,
  /value\.pressure/,
  /response\.body\.getReader\(\)/,
  /response\.headers\.get\(["']content-length["']\)/,
  /cache:\s*["']no-store["']/,
  /credentials:\s*["']omit["']/,
  /method:\s*["']GET["']/,
  /redirect:\s*["']error["']/,
  /referrerPolicy:\s*["']no-referrer["']/,
  /signal:\s*requestController\.signal/
]) {
  if (!required.test(webJmaTransportSource)) {
    violations.push(
      `${auditedWebJmaTransport}: 監査済み気象庁GET契約 ${required} が必要です`
    );
  }
}
const webJmaOrigins = [
  ...webJmaTransportSource.matchAll(/https?:\/\/[^\s"']+/g)
].map((match) => match[0]);
if (
  webJmaCalls !== 1 ||
  webJmaOrigins.length !== 3 ||
  webJmaOrigins.some((origin) => !origin.startsWith("https://www.jma.go.jp/bosai/amedas/")) ||
  /normalPressure|URLSearchParams|searchParams|FormData|sendBeacon|WebSocket/.test(
    webJmaTransportSource
  )
) {
  violations.push(
    `${auditedWebJmaTransport}: 座標なしの固定気象庁GET 3 endpoint以外を追加できません`
  );
}

const [
  macWeatherFactorySource,
  macJmaTransportSource,
  macOpenMeteoTransportSource
] = await Promise.all([
  readFile(join(root, auditedMacWeatherFactory), "utf8"),
  readFile(join(root, auditedMacJmaTransport), "utf8"),
  readFile(join(root, auditedMacOpenMeteoTransport), "utf8")
]);

for (const required of [
  /URLSessionConfiguration\.ephemeral/,
  /httpCookieStorage\s*=\s*nil/,
  /httpShouldSetCookies\s*=\s*false/,
  /urlCache\s*=\s*nil/,
  /requestCachePolicy\s*=\s*\.reloadIgnoringLocalCacheData/,
  /timeoutIntervalForRequest\s*=\s*10/,
  /timeoutIntervalForResource\s*=\s*15/,
  /CurrentWeatherNoRedirectDelegate\(\)/,
  /completionHandler\(nil\)/
]) {
  if (!required.test(macWeatherFactorySource)) {
    violations.push(
      `${auditedMacWeatherFactory}: 監査済みURLSession契約 ${required} が必要です`
    );
  }
}

const macJmaCalls = [
  ...macJmaTransportSource.matchAll(/session\.data\(for:\s*request\)/g)
].length;
for (const required of [
  /origin\s*=\s*["']https:\/\/www\.jma\.go\.jp["']/,
  /latestPath\s*=\s*["']\/bosai\/amedas\/data\/latest_time\.txt["']/,
  /stationPath\s*=\s*["']\/bosai\/amedas\/const\/amedastable\.json["']/,
  /["']\/bosai\/amedas\/data\/map\/["']/,
  /maximumStationDistanceKilometers\s*=\s*25\.0/,
  /maximumAgeSeconds\s*=\s*30\.0\s*\*\s*60\.0/,
  /observationAge\s*>?=\s*-Self\.maximumFutureSkewSeconds/,
  /observation\.pressure/,
  /quality\s*==\s*0/,
  /path\.hasPrefix\(["']\/bosai\/amedas\/["']\)/,
  /!path\.contains\(["']\?["']\)/,
  /url\.query\s*==\s*nil/,
  /request\.httpMethod\s*=\s*["']GET["']/,
  /httpResponse\.url\s*==\s*url/,
  /httpResponse\.mimeType\s*==\s*acceptedMIMEType/,
  /data\.count\s*<=\s*maximumBytes/
]) {
  if (!required.test(macJmaTransportSource)) {
    violations.push(
      `${auditedMacJmaTransport}: 監査済み気象庁GET契約 ${required} が必要です`
    );
  }
}
if (
  macJmaCalls !== 1 ||
  /normalPressure|httpBody|httpBodyStream|URLQueryItem/.test(
    macJmaTransportSource
  )
) {
  violations.push(
    `${auditedMacJmaTransport}: 座標なしの固定気象庁GET 3 endpoint以外を追加できません`
  );
}

const macWeatherCalls = [
  ...macOpenMeteoTransportSource.matchAll(/session\.data\(for:\s*request\)/g)
].length;
for (const required of [
  /components\.scheme\s*=\s*["']https["']/,
  /components\.host\s*=\s*["']api\.open-meteo\.com["']/,
  /components\.path\s*=\s*["']\/v1\/forecast["']/,
  /name:\s*["']latitude["']/,
  /name:\s*["']longitude["']/,
  /["']temperature_2m,["']\s*\+\s*["']relative_humidity_2m,["']\s*\+\s*["']surface_pressure["']/s,
  /name:\s*["']timezone["'],\s*value:\s*["']UTC["']/s,
  /name:\s*["']forecast_days["'],\s*value:\s*["']1["']/s,
  /request\.httpMethod\s*=\s*["']GET["']/,
  /httpResponse\.url\s*==\s*request\.url/,
  /httpResponse\.mimeType\s*==\s*["']application\/json["']/,
  /data\.count\s*<=\s*65_536/,
  /abs\(\s*clock\(\)\.timeIntervalSince\(observedAt\)\s*\)\s*<=\s*60\s*\*\s*60/s
]) {
  if (!required.test(macOpenMeteoTransportSource)) {
    violations.push(
      `${auditedMacOpenMeteoTransport}: 監査済みOpen-Meteo GET契約 ${required} が必要です`
    );
  }
}
if (
  macWeatherCalls !== 1 ||
  /customer-api\.open-meteo\.com|httpBody|httpBodyStream/.test(
    macOpenMeteoTransportSource
  )
) {
  violations.push(
    `${auditedMacOpenMeteoTransport}: 匿名の固定Open-Meteo GET 1件以外を追加できません`
  );
}

const eventTransportSource = await readFile(
  join(root, auditedEventTransport),
  "utf8"
);
const eventTransportFetchCalls = [
  ...eventTransportSource.matchAll(/\bfetch\s*\(/g)
].length;
for (const required of [
  /const EVENT_MANIFEST_PATH\s*=\s*["']\/event-data\/de442s\/de442s-manifest\.v1\.json["']/,
  /const EVENT_CANDIDATE_MANIFEST_PATH\s*=\s*["']\/event-data\/candidates\/event-candidates-manifest\.v1\.json["']/,
  /EVENT_CHUNK_PATH\.test\(path\)/,
  /EVENT_CANDIDATE_CHUNK_PATH\.test\(path\)/,
  /credentials:\s*["']same-origin["']/,
  /method:\s*["']GET["']/,
  /redirect:\s*["']error["']/,
  /referrerPolicy:\s*["']no-referrer["']/
]) {
  if (!required.test(eventTransportSource)) {
    violations.push(
      `${auditedEventTransport}: 監査済み同一origin GET契約 ${required} が必要です`
    );
  }
}
if (
  eventTransportFetchCalls !== 1 ||
  /https?:|URLSearchParams|searchParams|FormData/.test(
    eventTransportSource
  )
) {
  violations.push(
    `${auditedEventTransport}: 静的asset以外の通信を追加できません`
  );
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
  "connect-src 'self' https://www.jma.go.jp https://api.open-meteo.com",
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
      "監査済み同一origin静的asset GET 1件 / " +
      "明示操作の座標なし気象庁GET Web・macOS各3 endpoint / " +
      "Open-Meteo fallback匿名GET Web・macOS各1経路 / " +
      "dependency install script固定"
  );
}
