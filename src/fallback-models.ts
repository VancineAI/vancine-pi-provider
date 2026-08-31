import type { Model } from "@earendil-works/pi-ai";
import { BASE_URL, FALLBACK_MODEL_IDS, PROVIDER_ID } from "./constants.ts";

export type VancineChatModel = Model<"openai-completions">;

export interface ModelFactSource {
  urlOrPath: string;
  accessedAt: string;
  original: Record<string, unknown>;
  converted: Record<string, unknown>;
  kind: "fallback-snapshot" | "live-catalog";
}

const VANCINE_COMPAT = {
  supportsDeveloperRole: false,
} as const;

function vancineModel(
  model: Omit<VancineChatModel, "api" | "provider" | "baseUrl" | "compat">,
): VancineChatModel {
  return {
    ...model,
    api: "openai-completions",
    provider: PROVIDER_ID,
    baseUrl: BASE_URL,
    compat: { ...VANCINE_COMPAT },
  };
}

/**
 * Offline fallback used only when all of the following are true:
 * first run, no Pi catalog cache, and the dynamic catalog request failed.
 *
 * These four IDs are not a permanent whitelist. A successful catalog refresh
 * replaces this list entirely, including delisting any fallback model that
 * the server no longer publishes.
 *
 * Field sources are recorded in FALLBACK_MODEL_FACTS. cacheWrite is 0 because
 * the snapshot sources did not publish a cache-write USD/MTok rate (n/a), not
 * because a rate was guessed.
 */
export const FALLBACK_MODELS: readonly VancineChatModel[] = [
  vancineModel({
    id: "hy4-preview",
    name: "Hy4 preview",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.67, output: 2.0, cacheRead: 0.034, cacheWrite: 0 },
    contextWindow: 1_024_000,
    maxTokens: 64_000,
  }),
  vancineModel({
    id: "deepseek-v4-flash-vision-exp",
    name: "DeepSeek V4 Flash Vision Exp",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0.22, output: 0.66, cacheRead: 0.007, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 384_000,
  }),
  vancineModel({
    id: "glm-5.3-flash",
    name: "GLM-5.3-Flash",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0.06, output: 0.2, cacheRead: 0.012, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 131_072,
  }),
  vancineModel({
    id: "qwen3.8-flash",
    name: "Qwen3.8 Flash",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0.12, output: 0.38, cacheRead: 0.013, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 131_072,
  }),
];

export const FALLBACK_MODEL_FACTS: Record<(typeof FALLBACK_MODEL_IDS)[number], ModelFactSource> = {
  "hy4-preview": {
    urlOrPath:
      "vancine-models-dev/models.dev/models/tencent/hy4-preview.toml + providers/vancine/models/hy4-preview.toml; live GET https://vancine.com/api/pricing 2026-08-31T08:00:34Z",
    accessedAt: "2026-08-31T08:00:34Z",
    original: {
      name: "Hy4 preview",
      reasoning: true,
      modalities_input: ["text"],
      limit_context: 1_024_000,
      limit_output: 64_000,
      vancine_cost_usd_mtok: { input: 0.67, output: 2.0, cache_read: 0.034, cache_write: "n/a" },
      api_pricing_model_ratio: 0.335,
      api_pricing_completion_ratio: 2.985074626866,
      api_pricing_cache_ratio: 0.050746268657,
      api_pricing_tags: "Coding,Agent,Reasoning",
      api_pricing_supported_endpoint_types: ["openai"],
    },
    converted: {
      id: "hy4-preview",
      name: "Hy4 preview",
      reasoning: true,
      input: ["text"],
      contextWindow: 1_024_000,
      maxTokens: 64_000,
      cost: { input: 0.67, output: 2.0, cacheRead: 0.034, cacheWrite: 0 },
      compat: { supportsDeveloperRole: false },
    },
    kind: "fallback-snapshot",
  },
  "deepseek-v4-flash-vision-exp": {
    urlOrPath:
      "vancine-models-dev/models.dev/models/deepseek/deepseek-v4-flash-vision-exp.toml + providers/vancine/models/deepseek-v4-flash-vision-exp.toml; live GET https://vancine.com/api/pricing 2026-08-31T08:00:34Z",
    accessedAt: "2026-08-31T08:00:34Z",
    original: {
      name: "DeepSeek V4 Flash Vision Exp",
      reasoning: true,
      modalities_input: ["text", "image"],
      limit_context: 1_000_000,
      limit_output: 384_000,
      vancine_cost_usd_mtok: { input: 0.22, output: 0.66, cache_read: 0.007, cache_write: "n/a" },
      api_pricing_model_ratio: 0.11,
      api_pricing_completion_ratio: 3,
      api_pricing_cache_ratio: 0.031818181818,
      api_pricing_tags: "Vision,Agent,Reasoning",
      api_pricing_supported_endpoint_types: ["openai"],
    },
    converted: {
      id: "deepseek-v4-flash-vision-exp",
      name: "DeepSeek V4 Flash Vision Exp",
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 1_000_000,
      maxTokens: 384_000,
      cost: { input: 0.22, output: 0.66, cacheRead: 0.007, cacheWrite: 0 },
      compat: { supportsDeveloperRole: false },
    },
    kind: "fallback-snapshot",
  },
  "glm-5.3-flash": {
    urlOrPath:
      "vancine-models-dev/models.dev/models/zhipuai/glm-5.3-flash.toml + providers/vancine/models/glm-5.3-flash.toml; live GET https://models.dev/api.json provider=vancine and GET https://vancine.com/api/pricing 2026-08-31T08:00:34Z",
    accessedAt: "2026-08-31T08:00:34Z",
    original: {
      name: "GLM-5.3-Flash",
      reasoning: true,
      modalities_input: ["text", "image", "video", "pdf"],
      limit_context: 1_000_000,
      limit_output: 131_072,
      vancine_cost_usd_mtok: { input: 0.06, output: 0.2, cache_read: 0.012, cache_write: "n/a" },
      api_pricing_model_ratio: 0.03,
      api_pricing_completion_ratio: 3.333333333333,
      api_pricing_cache_ratio: 0.2,
      api_pricing_tags: "Vision,Agent,Reasoning",
      api_pricing_supported_endpoint_types: ["openai"],
      pi_input_note: "Pi Model.input only accepts text|image; video/pdf were dropped, image was kept from the source.",
    },
    converted: {
      id: "glm-5.3-flash",
      name: "GLM-5.3-Flash",
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 1_000_000,
      maxTokens: 131_072,
      cost: { input: 0.06, output: 0.2, cacheRead: 0.012, cacheWrite: 0 },
      compat: { supportsDeveloperRole: false },
    },
    kind: "fallback-snapshot",
  },
  "qwen3.8-flash": {
    urlOrPath:
      "vancine-models-dev/models.dev/models/alibaba/qwen3.8-flash.toml + providers/vancine/models/qwen3.8-flash.toml; live GET https://models.dev/api.json provider=vancine and GET https://vancine.com/api/pricing 2026-08-31T08:00:34Z",
    accessedAt: "2026-08-31T08:00:34Z",
    original: {
      name: "Qwen3.8 Flash",
      reasoning: true,
      modalities_input: ["text", "image", "video"],
      limit_context: 1_000_000,
      limit_output: 131_072,
      vancine_cost_usd_mtok: { input: 0.12, output: 0.38, cache_read: 0.013, cache_write: "n/a" },
      api_pricing_model_ratio: 0.06,
      api_pricing_completion_ratio: 3.166666666667,
      api_pricing_cache_ratio: 0.108333333333,
      api_pricing_tags: "Vision,Agent,Reasoning",
      api_pricing_supported_endpoint_types: ["openai"],
      pi_input_note: "Pi Model.input only accepts text|image; video was dropped, image was kept from the source.",
    },
    converted: {
      id: "qwen3.8-flash",
      name: "Qwen3.8 Flash",
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 1_000_000,
      maxTokens: 131_072,
      cost: { input: 0.12, output: 0.38, cacheRead: 0.013, cacheWrite: 0 },
      compat: { supportsDeveloperRole: false },
    },
    kind: "fallback-snapshot",
  },
};

export function isFallbackModelSet(models: readonly { id: string }[]): boolean {
  if (models.length !== FALLBACK_MODEL_IDS.length) {
    return false;
  }
  return FALLBACK_MODEL_IDS.every((id, index) => models[index]?.id === id);
}
