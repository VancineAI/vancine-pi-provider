import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createVancineProvider } from "./provider.ts";

export default function (pi: ExtensionAPI): void {
  pi.registerProvider(createVancineProvider());
}

export { createVancineProvider } from "./provider.ts";
export { convertVancineCatalog, parseVancineCatalog } from "./catalog.ts";
export { FALLBACK_MODELS, FALLBACK_MODEL_FACTS } from "./fallback-models.ts";
export { PROVIDER_ID, PROVIDER_NAME, BASE_URL, CATALOG_URL, FALLBACK_MODEL_IDS } from "./constants.ts";
