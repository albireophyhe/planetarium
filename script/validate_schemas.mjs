import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const contracts = [
  {
    data: "shared/catalog/bright-stars.v1.json",
    schema: "shared/schema/bright-stars.schema.json"
  },
  {
    data: "shared/catalog/bright-stars.lock.v1.json",
    schema: "shared/schema/bright-stars-lock.schema.json"
  },
  {
    data: "shared/catalog/bright-stars.v2.json",
    schema: "shared/schema/bright-stars-v2.schema.json"
  },
  {
    data: "shared/catalog/bright-stars.lock.v2.json",
    schema: "shared/schema/bright-stars-lock-v2.schema.json"
  },
  {
    data: "shared/catalog/render-stars.v1.json",
    schema: "shared/schema/render-stars.schema.json"
  },
  {
    data: "shared/catalog/render-stars.lock.v1.json",
    schema: "shared/schema/render-stars-lock.schema.json"
  },
  {
    data: "shared/catalog/star-names.v1.json",
    schema: "shared/schema/star-names.schema.json"
  },
  {
    data: "shared/catalog/constellations.v1.json",
    schema: "shared/schema/constellations.schema.json"
  },
  {
    data: "shared/catalog/cities.v1.json",
    schema: "shared/schema/cities.schema.json"
  },
  {
    data: "shared/eop/iers-finals2000a-dut1.v1.json",
    schema: "shared/schema/iers-finals2000a-dut1.schema.json"
  },
  {
    data: "shared/eop/iers-finals2000a-dut1.lock.v1.json",
    schema: "shared/schema/iers-finals2000a-dut1-lock.schema.json"
  },
  {
    data: "shared/eop/iers-finals2000a-eop.v1.json",
    schema: "shared/schema/iers-finals2000a-eop.schema.json"
  },
  {
    data: "shared/eop/iers-finals2000a-eop.lock.v1.json",
    schema: "shared/schema/iers-finals2000a-eop-lock.schema.json"
  },
  {
    data: "shared/eop/source/finals2000A.snapshot.v1.json",
    schema: "shared/schema/iers-finals2000a-snapshot.schema.json"
  },
  {
    data: "shared/fixtures/astro-test-vectors.v1.json",
    schema: "shared/schema/astro-test-vectors.schema.json"
  },
  {
    data: "shared/fixtures/astro-test-vectors.v2.json",
    schema: "shared/schema/astro-test-vectors-v2.schema.json"
  },
  {
    data: "shared/fixtures/refraction-guardrails.v1.json",
    schema: "shared/schema/refraction-guardrails.schema.json"
  },
  {
    data: "shared/fixtures/sofa-diurnal-aberration.v1.json",
    schema: "shared/schema/sofa-diurnal-aberration.schema.json"
  },
  {
    data: "shared/fixtures/sofa-solar-light-deflection.v1.json",
    schema:
      "shared/schema/sofa-solar-light-deflection.schema.json"
  },
  {
    data: "shared/fixtures/sofa-solar-position.v1.json",
    schema: "shared/schema/sofa-solar-position.schema.json"
  },
  {
    data:
      "shared/ephemeris/truncated-earth-heliocentric.v1.json",
    schema:
      "shared/schema/truncated-earth-heliocentric.schema.json"
  },
  {
    data: "shared/ephemeris/de442s/de442s-manifest.v1.json",
    schema: "shared/schema/de442s-ephemeris.schema.json"
  },
  {
    data: "shared/fixtures/de442s-ephemeris.v1.json",
    schema: "shared/schema/de442s-ephemeris-fixture.schema.json"
  },
  {
    data:
      "shared/fixtures/eclipse-contact-position-angles.v1.json",
    schema:
      "shared/schema/eclipse-contact-position-angles.schema.json"
  },
  {
    data: "shared/events/event-candidates-manifest.v1.json",
    schema: "shared/schema/event-candidates-manifest.schema.json"
  },
  {
    data: "shared/fixtures/event-candidates.v1.json",
    schema: "shared/schema/event-candidates-fixture.schema.json"
  },
  {
    data:
      "shared/fixtures/event-earth-rotation-model.v1.json",
    schema:
      "shared/schema/event-earth-rotation-model.schema.json"
  },
  {
    data:
      "shared/fixtures/event-forecast-year-coverage.v1.json",
    schema:
      "shared/schema/event-forecast-year-coverage.schema.json"
  },
  {
    data:
      "shared/fixtures/event-physical-samples.v1.json",
    schema:
      "shared/schema/event-physical-samples.schema.json"
  },
  {
    data:
      "shared/fixtures/nasa-solar-eclipses-2021-2030.v1.json",
    schema:
      "shared/schema/nasa-solar-eclipses-2021-2030.schema.json"
  },
  {
    data:
      "shared/fixtures/nasa-lunar-eclipses-2021-2030.v1.json",
    schema:
      "shared/schema/nasa-lunar-eclipses-2021-2030.schema.json"
  }
];

const readJson = async (relativePath) =>
  JSON.parse(
    await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8")
  );

const dut1Manifest = await readJson(
  "shared/eop/iers-finals2000a-dut1.v1.json"
);
for (const chunk of dut1Manifest.chunks ?? []) {
  contracts.push({
    data: chunk.file,
    schema:
      "shared/schema/iers-finals2000a-dut1-chunk.schema.json"
  });
}

const eopManifest = await readJson(
  "shared/eop/iers-finals2000a-eop.v1.json"
);
for (const chunk of eopManifest.chunks ?? []) {
  contracts.push({
    data: chunk.file,
    schema:
      "shared/schema/iers-finals2000a-eop-chunk.schema.json"
  });
}

const eventCandidateManifest = await readJson(
  "shared/events/event-candidates-manifest.v1.json"
);
for (const chunk of eventCandidateManifest.chunks ?? []) {
  contracts.push({
    data: chunk.file,
    schema:
      "shared/schema/event-candidates-chunk.schema.json"
  });
}

const ajv = new Ajv2020({
  allErrors: true,
  strict: true
});
addFormats(ajv);

let violationCount = 0;
const validatorsBySchema = new Map();
for (const contract of contracts) {
  const data = await readJson(contract.data);
  let validate = validatorsBySchema.get(contract.schema);
  if (!validate) {
    validate = ajv.compile(await readJson(contract.schema));
    validatorsBySchema.set(contract.schema, validate);
  }
  if (!validate(data)) {
    const details = (validate.errors ?? [])
      .map(
        ({ instancePath, message, params }) =>
          `  ${instancePath || "/"} ${message ?? "is invalid"} ` +
          JSON.stringify(params)
      )
      .join("\n");
    console.error(`${contract.data}:\n${details}`);
    violationCount += validate.errors?.length ?? 1;
  }
}

if (violationCount > 0) {
  console.error(`JSON Schema検証エラー: ${violationCount}件`);
  process.exitCode = 1;
} else {
  console.log(`JSON Schema検証OK: ${contracts.length}データセット`);
}
