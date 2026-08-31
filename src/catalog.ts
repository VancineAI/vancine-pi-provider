import { BASE_URL, CATALOG_SCHEMA_VERSION, PROVIDER_ID } from "./constants.ts";
import { CatalogError } from "./errors.ts";
import type { VancineChatModel } from "./fallback-models.ts";

const CHAT_KIND = "chat";
const CHAT_API = "openai-completions";
const CHAT_ENDPOINTS = new Set(["chat.completions", "openai-completions"]);

const EXCLUDED_KINDS = new Set([
  "image",
  "image-generation",
  "video",
  "audio",
  "tts",
  "3d",
  "embedding",
  "embeddings",
  "rerank",
  "task",
  "async",
]);

const EXCLUDED_ENDPOINTS = new Set([
  "image-generation",
  "images.generations",
  "audio.speech",
  "audio.transcriptions",
  "embeddings",
  "rerank",
  "video.generations",
  "videos.generations",
]);

export interface VancineCatalogCost {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface VancineCatalogModel {
  id: string;
  name: string;
  enabled: boolean;
  available: boolean;
  kind: string;
  api: string;
  endpoint?: string;
  input: string[];
  reasoning: boolean;
  contextWindow: number;
  maxTokens: number;
  cost: VancineCatalogCost;
  compat?: {
    supportsDeveloperRole?: boolean;
    supportsReasoningEffort?: boolean;
  };
}

export interface VancineCatalog {
  provider: string;
  schemaVersion: number;
  generatedAt?: string;
  models: VancineCatalogModel[];
}

export interface CatalogConvertResult {
  models: VancineChatModel[];
  skipped: { id: string; reason: string }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new CatalogError("invalid_catalog", `Catalog field ${field} must be a non-empty string`);
  }
  return value.trim();
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new CatalogError("invalid_catalog", `Catalog field ${field} must be a boolean`);
  }
  return value;
}

function requiredPositiveInt(value: unknown, field: string): number {
  if (!isFiniteNumber(value) || !Number.isInteger(value) || value <= 0) {
    throw new CatalogError("invalid_catalog", `Catalog field ${field} must be a positive integer`);
  }
  return value;
}

function requiredCost(value: unknown, field: string): VancineCatalogCost {
  if (!isRecord(value)) {
    throw new CatalogError("invalid_catalog", `Catalog field ${field} must be an object`);
  }
  for (const key of ["input", "output", "cacheRead", "cacheWrite"] as const) {
    if (!isFiniteNumber(value[key]) || value[key] < 0) {
      throw new CatalogError("invalid_catalog", `Catalog field ${field}.${key} must be a non-negative number`);
    }
  }
  return {
    input: value.input as number,
    output: value.output as number,
    cacheRead: value.cacheRead as number,
    cacheWrite: value.cacheWrite as number,
  };
}

function parseInput(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new CatalogError("invalid_catalog", `Catalog field ${field} must be an array of strings`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function parseCatalogModel(value: unknown, index: number): VancineCatalogModel {
  if (!isRecord(value)) {
    throw new CatalogError("invalid_catalog", `Catalog models[${index}] must be an object`);
  }
  const prefix = `models[${index}]`;
  const id = requiredString(value.id, `${prefix}.id`);
  const compat = isRecord(value.compat) ? value.compat : undefined;
  return {
    id,
    name: requiredString(value.name, `${prefix}.name`),
    enabled: requiredBoolean(value.enabled, `${prefix}.enabled`),
    available: requiredBoolean(value.available, `${prefix}.available`),
    kind: requiredString(value.kind, `${prefix}.kind`),
    api: requiredString(value.api, `${prefix}.api`),
    endpoint: typeof value.endpoint === "string" ? value.endpoint.trim() : undefined,
    input: parseInput(value.input, `${prefix}.input`),
    reasoning: requiredBoolean(value.reasoning, `${prefix}.reasoning`),
    contextWindow: requiredPositiveInt(value.contextWindow, `${prefix}.contextWindow`),
    maxTokens: requiredPositiveInt(value.maxTokens, `${prefix}.maxTokens`),
    cost: requiredCost(value.cost, `${prefix}.cost`),
    compat: compat
      ? {
          supportsDeveloperRole:
            typeof compat.supportsDeveloperRole === "boolean" ? compat.supportsDeveloperRole : undefined,
          supportsReasoningEffort:
            typeof compat.supportsReasoningEffort === "boolean" ? compat.supportsReasoningEffort : undefined,
        }
      : undefined,
  };
}

export function parseVancineCatalog(payload: unknown): VancineCatalog {
  if (!isRecord(payload)) {
    throw new CatalogError("invalid_catalog", "Catalog payload must be a JSON object");
  }
  if (Array.isArray(payload.data) && !Array.isArray(payload.models)) {
    throw new CatalogError(
      "invalid_catalog",
      "Catalog is not a Vancine Pi catalog (looks like /api/pricing). Missing models[], contextWindow, maxTokens, and kind.",
    );
  }
  const provider = requiredString(payload.provider, "provider");
  if (provider !== PROVIDER_ID) {
    throw new CatalogError("invalid_catalog", `Catalog provider must be "${PROVIDER_ID}"`);
  }
  if (payload.schemaVersion !== CATALOG_SCHEMA_VERSION) {
    throw new CatalogError(
      "invalid_catalog",
      `Catalog schemaVersion must be ${CATALOG_SCHEMA_VERSION}`,
    );
  }
  if (!Array.isArray(payload.models)) {
    throw new CatalogError("invalid_catalog", "Catalog models must be an array");
  }
  return {
    provider,
    schemaVersion: CATALOG_SCHEMA_VERSION,
    generatedAt: typeof payload.generatedAt === "string" ? payload.generatedAt : undefined,
    models: payload.models.map((model, index) => parseCatalogModel(model, index)),
  };
}

function piInput(input: string[]): ("text" | "image")[] | undefined {
  const hasText = input.includes("text");
  if (!hasText) {
    return undefined;
  }
  return input.includes("image") ? ["text", "image"] : ["text"];
}

function isExcluded(model: VancineCatalogModel): string | undefined {
  const kind = model.kind.toLowerCase();
  if (kind !== CHAT_KIND) {
    if (EXCLUDED_KINDS.has(kind)) {
      return `kind ${model.kind} is not a chat completions model`;
    }
    return `kind ${model.kind} is not chat`;
  }
  if (model.api !== CHAT_API) {
    return `api ${model.api} is not ${CHAT_API}`;
  }
  if (model.endpoint && !CHAT_ENDPOINTS.has(model.endpoint)) {
    if (EXCLUDED_ENDPOINTS.has(model.endpoint)) {
      return `endpoint ${model.endpoint} is not chat completions`;
    }
    return `endpoint ${model.endpoint} is not chat completions`;
  }
  if (!model.enabled) {
    return "disabled";
  }
  if (!model.available) {
    return "unavailable";
  }
  const input = piInput(model.input);
  if (!input) {
    return "does not support text input";
  }
  return undefined;
}

export function convertVancineCatalog(payload: unknown): CatalogConvertResult {
  const catalog = parseVancineCatalog(payload);
  const models: VancineChatModel[] = [];
  const skipped: { id: string; reason: string }[] = [];
  const seen = new Set<string>();

  for (const entry of catalog.models) {
    if (seen.has(entry.id)) {
      skipped.push({ id: entry.id, reason: "duplicate id; first occurrence kept" });
      continue;
    }
    seen.add(entry.id);

    const reason = isExcluded(entry);
    if (reason) {
      skipped.push({ id: entry.id, reason });
      continue;
    }

    const input = piInput(entry.input);
    if (!input) {
      skipped.push({ id: entry.id, reason: "does not support text input" });
      continue;
    }

    models.push({
      id: entry.id,
      name: entry.name,
      api: "openai-completions",
      provider: PROVIDER_ID,
      baseUrl: BASE_URL,
      reasoning: entry.reasoning,
      input,
      cost: {
        input: entry.cost.input,
        output: entry.cost.output,
        cacheRead: entry.cost.cacheRead,
        cacheWrite: entry.cost.cacheWrite,
      },
      contextWindow: entry.contextWindow,
      maxTokens: entry.maxTokens,
      compat: {
        supportsDeveloperRole: false,
        ...(entry.compat?.supportsReasoningEffort === undefined
          ? {}
          : { supportsReasoningEffort: entry.compat.supportsReasoningEffort }),
      },
    });
  }

  return { models, skipped };
}
