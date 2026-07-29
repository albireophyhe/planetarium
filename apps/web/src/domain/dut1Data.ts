import manifestJson from "../../../../shared/eop/iers-finals2000a-dut1.v1.json";
import {
  createChunkedDut1Lookup,
  type Dut1ChunkDescriptorV1,
  type EncodedDut1ChunkV1,
  type IersDut1ServiceV1,
} from "./dut1";

type Dut1ManifestV1 = {
  readonly schemaVersion: 1;
  readonly source: IersDut1ServiceV1["source"];
  readonly coverage: IersDut1ServiceV1["coverage"];
  readonly chunks: readonly Dut1ChunkDescriptorV1[];
};

const manifest = manifestJson as unknown as Dut1ManifestV1;
const chunkModules = import.meta.glob<{ default: EncodedDut1ChunkV1 }>(
  "../../../../shared/eop/dut1/*.v1.json",
);

const lookup = createChunkedDut1Lookup(
  manifest.chunks,
  async (descriptor) => {
    const modulePath = `../../../../${descriptor.file}`;
    const loadModule = chunkModules[modulePath];
    if (!loadModule) {
      throw new Error(`Missing bundled DUT1 chunk: ${descriptor.file}`);
    }
    return (await loadModule()).default;
  },
);

export const iersDut1Service: IersDut1ServiceV1 = Object.freeze({
  coverage: Object.freeze({ ...manifest.coverage }),
  source: Object.freeze({
    title: manifest.source.title,
    url: manifest.source.url,
    retrievedAt: manifest.source.retrievedAt,
    sourceLastModified: manifest.source.sourceLastModified,
    sourceSha256: manifest.source.sourceSha256,
  }),
  lookup,
});
