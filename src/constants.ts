export const PROVIDER_ID = "vancine";
export const PROVIDER_NAME = "Vancine";
export const BASE_URL = "https://vancine.com/v1";
export const VANCINE_ORIGIN = "https://vancine.com";

/** Production Pi catalog. See docs/catalog-endpoint.md. */
export const CATALOG_URL = "https://vancine.com/api/pi/catalog";

export const CATALOG_TIMEOUT_MS = 8_000;
export const CATALOG_REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1000;
export const CATALOG_SCHEMA_VERSION = 1;

export const FALLBACK_MODEL_IDS = [
  "hy4-preview",
  "deepseek-v4-flash-vision-exp",
  "glm-5.3-flash",
  "qwen3.8-flash",
] as const;

export type FallbackModelId = (typeof FALLBACK_MODEL_IDS)[number];
