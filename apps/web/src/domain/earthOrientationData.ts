import manifestJson from "../../../../shared/eop/iers-finals2000a-eop.v1.json";
import {
  createChunkedEarthOrientationLookup,
  type EarthOrientationChunkDescriptorV1,
  type EncodedEarthOrientationChunkV1,
  type IersEarthOrientationServiceV1
} from "./earthOrientation";

type EarthOrientationManifestV1 = {
  readonly schemaVersion: 1;
  readonly source: IersEarthOrientationServiceV1["source"];
  readonly coverage: IersEarthOrientationServiceV1["coverage"];
  readonly chunks: readonly EarthOrientationChunkDescriptorV1[];
};

const manifest =
  manifestJson as unknown as EarthOrientationManifestV1;
const chunkModules = import.meta.glob<{
  default: EncodedEarthOrientationChunkV1;
}>("../../../../shared/eop/eop/*.v1.json");

const lookup = createChunkedEarthOrientationLookup(
  manifest.chunks,
  async (descriptor) => {
    const modulePath = `../../../../${descriptor.file}`;
    const loadModule = chunkModules[modulePath];
    if (!loadModule) {
      throw new Error(
        `Missing bundled Earth-orientation chunk: ${descriptor.file}`
      );
    }
    return (await loadModule()).default;
  }
);

export const iersEarthOrientationService: IersEarthOrientationServiceV1 =
  Object.freeze({
    coverage: Object.freeze({
      ...manifest.coverage,
      polarMotion: Object.freeze({
        ...manifest.coverage.polarMotion
      }),
      dut1: Object.freeze({ ...manifest.coverage.dut1 })
    }),
    source: Object.freeze({
      title: manifest.source.title,
      url: manifest.source.url,
      retrievedAt: manifest.source.retrievedAt,
      sourceLastModified: manifest.source.sourceLastModified,
      sourceSha256: manifest.source.sourceSha256
    }),
    lookup
  });
