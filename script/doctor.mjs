import { readFile } from "node:fs/promises";
import process from "node:process";

const expectedNode = (
  await readFile(new URL("../.node-version", import.meta.url), "utf8")
).trim();
const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8")
);
const expectedNpm = packageJson.engines?.npm;
const actualNode = process.versions.node;
const npmUserAgent = process.env.npm_config_user_agent ?? "";
const actualNpm = npmUserAgent.match(/\bnpm\/([^\s]+)/)?.[1];

if (packageJson.engines?.node !== expectedNode) {
  console.error(
    `.node-version (${expectedNode}) とpackage.json engines.node ` +
      `(${packageJson.engines?.node ?? "なし"}) が一致しません。`
  );
  process.exit(1);
}

if (actualNode !== expectedNode) {
  console.error(
    `Node.js ${expectedNode} が必要です。現在は ${actualNode} です。` +
      "\nasdf利用時: ASDF_NODEJS_VERSION=" +
      expectedNode +
      " npm run doctor"
  );
  process.exit(1);
}

if (typeof expectedNpm !== "string" || actualNpm !== expectedNpm) {
  console.error(
    `npm ${expectedNpm ?? "（package.jsonに未設定）"} が必要です。` +
      `現在は ${actualNpm ?? "判定不能"} です。` +
      "\nこの検査はnpm run doctorから実行してください。"
  );
  process.exit(1);
}

console.log(`Node.js ${actualNode} / npm ${actualNpm}`);
