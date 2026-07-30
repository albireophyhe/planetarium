import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const schemaUrl = new URL(
  "../shared/schema/star-pointing-profile-v1.schema.json",
  import.meta.url
);

let cachedValidator;

export async function starPointingProfileValidator() {
  if (cachedValidator) {
    return cachedValidator;
  }
  const schema = JSON.parse(await readFile(schemaUrl, "utf8"));
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true
  });
  addFormats(ajv);
  cachedValidator = ajv.compile(schema);
  return cachedValidator;
}

export function formatStarPointingProfileErrors(errors) {
  return (errors ?? [])
    .map(
      ({ instancePath, message, params }) =>
        `${instancePath || "/"} ${message ?? "is invalid"} ` +
        JSON.stringify(params)
    )
    .join("\n");
}

export async function validateStarPointingProfile(value) {
  const validate = await starPointingProfileValidator();
  const valid = validate(value);
  return {
    errors: valid ? [] : [...(validate.errors ?? [])],
    valid
  };
}

async function readInput(file) {
  const source = file === "-" ? "stdin" : file;
  let json;
  if (file === "-") {
    process.stdin.setEncoding("utf8");
    json = "";
    for await (const chunk of process.stdin) {
      json += chunk;
    }
  } else {
    json = await readFile(file, "utf8");
  }
  try {
    return { source, value: JSON.parse(json) };
  } catch (error) {
    throw new SyntaxError(
      `${source}: JSONを解析できません: ${error.message}`,
      { cause: error }
    );
  }
}

async function runCli(files) {
  if (
    files.length === 0 ||
    files.includes("--help") ||
    files.includes("-h")
  ) {
    console.log(
      "Usage: node script/validate_star_pointing_profile.mjs <profile.json|-> [...]"
    );
    return files.length === 0 ? 1 : 0;
  }

  let failureCount = 0;
  let stdinConsumed = false;
  for (const file of files) {
    if (file === "-" && stdinConsumed) {
      console.error("stdinは1回だけ指定できます");
      failureCount += 1;
      continue;
    }
    stdinConsumed ||= file === "-";
    try {
      const { source, value } = await readInput(file);
      const result = await validateStarPointingProfile(value);
      if (result.valid) {
        console.log(`${source}: precision pointing profile OK`);
      } else {
        console.error(
          `${source}: precision pointing profile validation failed\n` +
            formatStarPointingProfileErrors(result.errors)
        );
        failureCount += 1;
      }
    } catch (error) {
      console.error(error.message);
      failureCount += 1;
    }
  }
  return failureCount === 0 ? 0 : 1;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  process.exitCode = await runCli(process.argv.slice(2));
}
