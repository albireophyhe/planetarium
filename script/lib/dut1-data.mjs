/**
 * Legacy compatibility facade.
 *
 * The canonical builder now normalizes the complete finals2000A Earth
 * orientation subset. Keep the historical exports available for scripts that
 * still build or validate the DUT1-only compatibility artifacts.
 */
export {
  buildDut1Artifacts,
  createSnapshot,
  digest,
  DUT1_CHECKSUM_URL,
  DUT1_DISTRIBUTION_STATEMENT,
  DUT1_DISTRIBUTION_URL,
  DUT1_FORMAT_URL,
  DUT1_PATHS,
  DUT1_PRODUCT_METADATA_URL,
  DUT1_SIZE_BUDGET,
  DUT1_SOURCE_URL,
  parseFinals2000ADut1 as parseFinals2000A
} from "./eop-data.mjs";
