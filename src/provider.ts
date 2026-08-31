import {
  createProvider,
  openAICompletionsApi,
  type ModelsStoreEntry,
  type Provider,
  type RefreshModelsContext,
} from "@earendil-works/pi-ai/compat";
import { loginWithApiKey, resolveApiKey, API_KEY_AUTH_NAME } from "./auth.ts";
import { fetchVancineCatalog, httpDateFromTimestamp, type CatalogTransport } from "./catalog-client.ts";
import { convertVancineCatalog } from "./catalog.ts";
import {
  BASE_URL,
  CATALOG_REFRESH_INTERVAL_MS,
  CATALOG_URL,
  PROVIDER_ID,
  PROVIDER_NAME,
} from "./constants.ts";
import { CatalogError, errorMessage } from "./errors.ts";
import { FALLBACK_MODELS, type VancineChatModel } from "./fallback-models.ts";

export interface VancineProviderOptions {
  catalogUrl?: string;
  timeoutMs?: number;
  refreshIntervalMs?: number;
  transport?: CatalogTransport;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function normalizeCachedInput(value: unknown): ("text" | "image")[] | undefined {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return undefined;
  }
  if (!value.includes("text")) {
    return undefined;
  }
  return value.includes("image") ? ["text", "image"] : ["text"];
}

function storedContainsSecrets(stored: ModelsStoreEntry, secret?: string): boolean {
  const text = JSON.stringify(stored);
  if (secret && secret.length >= 4 && text.includes(secret)) {
    return true;
  }
  return /authorization/i.test(text) || /"apiKey"\s*:/i.test(text) || /bearer\s+\S/i.test(text);
}

function cacheContainsSecret(entry: ModelsStoreEntry, secret: string | undefined): boolean {
  return storedContainsSecrets(entry, secret);
}

/** Rebuild a cached model from allowlisted fields only. Never trust stored baseUrl/headers/compat. */
export function sanitizeStoredModel(raw: unknown): VancineChatModel | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  if (raw.provider !== PROVIDER_ID || raw.api !== "openai-completions") {
    return undefined;
  }
  if (typeof raw.id !== "string" || raw.id.trim() === "") {
    return undefined;
  }
  if (typeof raw.name !== "string" || raw.name.trim() === "") {
    return undefined;
  }
  if (typeof raw.reasoning !== "boolean") {
    return undefined;
  }
  const input = normalizeCachedInput(raw.input);
  if (!input) {
    return undefined;
  }
  if (!isRecord(raw.cost)) {
    return undefined;
  }
  if (
    !isFiniteNonNegative(raw.cost.input) ||
    !isFiniteNonNegative(raw.cost.output) ||
    !isFiniteNonNegative(raw.cost.cacheRead) ||
    !isFiniteNonNegative(raw.cost.cacheWrite)
  ) {
    return undefined;
  }
  if (!isPositiveInt(raw.contextWindow) || !isPositiveInt(raw.maxTokens)) {
    return undefined;
  }
  const supportsReasoningEffort =
    isRecord(raw.compat) && typeof raw.compat.supportsReasoningEffort === "boolean"
      ? raw.compat.supportsReasoningEffort
      : undefined;
  return {
    id: raw.id.trim(),
    name: raw.name.trim(),
    api: "openai-completions",
    provider: PROVIDER_ID,
    baseUrl: BASE_URL,
    reasoning: raw.reasoning,
    input,
    cost: {
      input: raw.cost.input,
      output: raw.cost.output,
      cacheRead: raw.cost.cacheRead,
      cacheWrite: raw.cost.cacheWrite,
    },
    contextWindow: raw.contextWindow,
    maxTokens: raw.maxTokens,
    compat: {
      supportsDeveloperRole: false,
      ...(supportsReasoningEffort === undefined ? {} : { supportsReasoningEffort }),
    },
  };
}

export type RestoredCatalog =
  | { status: "missing"; models: [] }
  | { status: "valid"; models: VancineChatModel[] }
  | { status: "rejected"; models: [] };

export function restoreStoredCatalog(
  stored: ModelsStoreEntry | undefined,
  secret?: string,
): RestoredCatalog {
  if (stored === undefined) {
    return { status: "missing", models: [] };
  }
  if (storedContainsSecrets(stored, secret)) {
    return { status: "rejected", models: [] };
  }
  if (!Array.isArray(stored.models)) {
    return { status: "rejected", models: [] };
  }
  const models = stored.models
    .map((model) => sanitizeStoredModel(model))
    .filter((model): model is VancineChatModel => model !== undefined);
  if (stored.models.length > 0 && models.length === 0) {
    return { status: "rejected", models: [] };
  }
  return { status: "valid", models };
}

export function createVancineProvider(options: VancineProviderOptions = {}): Provider {
  let currentModels: VancineChatModel[] = [];
  const catalogUrl = options.catalogUrl ?? CATALOG_URL;
  const refreshIntervalMs = options.refreshIntervalMs ?? CATALOG_REFRESH_INTERVAL_MS;

  const base = createProvider({
    id: PROVIDER_ID,
    name: PROVIDER_NAME,
    baseUrl: BASE_URL,
    auth: {
      apiKey: {
        name: API_KEY_AUTH_NAME,
        login: loginWithApiKey,
        async resolve({ credential }) {
          return resolveApiKey({ credential });
        },
      },
    },
    models: [],
    api: openAICompletionsApi(),
  });

  const refreshModels = async (context: RefreshModelsContext): Promise<void> => {
    const secret = context.credential?.type === "api_key" ? context.credential.key : undefined;
    const storedSnapshot = context.stored;
    const restored = restoreStoredCatalog(storedSnapshot, secret);

    if (restored.status === "rejected") {
      const published = await context.publish({
        persist: null,
        update: () => {
          currentModels = [];
        },
      });
      if (!published) {
        return;
      }
    } else if (restored.status === "valid") {
      const published = await context.publish({
        update: () => {
          currentModels = restored.models;
        },
      });
      if (!published) {
        return;
      }
    }

    if (!context.allowNetwork || context.signal.aborted) {
      return;
    }

    if (
      !context.force &&
      restored.status === "valid" &&
      storedSnapshot?.checkedAt !== undefined &&
      Date.now() - storedSnapshot.checkedAt < refreshIntervalMs
    ) {
      return;
    }

    const validators = restored.status === "valid" ? storedSnapshot : undefined;

    try {
      const result = await fetchVancineCatalog({
        url: catalogUrl,
        etag: validators?.etag,
        lastModifiedHttp: httpDateFromTimestamp(validators?.lastModified),
        signal: context.signal,
        timeoutMs: options.timeoutMs,
        transport: options.transport,
      });

      if (context.signal.aborted) {
        return;
      }

      const checkedAt = Date.now();

      if (result.status === "not_modified") {
        if (restored.status === "valid" && storedSnapshot) {
          await context.publish({
            persist: {
              models: restored.models,
              checkedAt,
              etag: result.etag ?? storedSnapshot.etag,
              lastModified: result.lastModified ?? storedSnapshot.lastModified,
            },
          });
        }
        return;
      }

      const converted = convertVancineCatalog(result.payload);
      const entry: ModelsStoreEntry = {
        models: converted.models,
        checkedAt,
        lastModified: result.lastModified,
        etag: result.etag,
      };
      if (cacheContainsSecret(entry, secret)) {
        throw new CatalogError("invalid_catalog", "Refusing to persist catalog data that contains a credential");
      }
      await context.publish({
        persist: entry,
        update: () => {
          currentModels = converted.models;
        },
      });
    } catch (error) {
      if (context.signal.aborted || (error instanceof CatalogError && error.code === "aborted")) {
        return;
      }
      if (restored.status === "missing" || restored.status === "rejected") {
        await context.publish({
          update: () => {
            currentModels = [...FALLBACK_MODELS];
          },
        });
      } else if (restored.status === "valid" && storedSnapshot !== undefined) {
        await context.publish({
          persist: {
            models: restored.models,
            checkedAt: Date.now(),
            etag: storedSnapshot.etag,
            lastModified: storedSnapshot.lastModified,
          },
        });
      }
      const message = errorMessage(error, secret);
      throw new CatalogError(
        error instanceof CatalogError ? error.code : "network",
        message,
        { cause: error },
      );
    }
  };

  return {
    ...base,
    getModels: () => currentModels,
    refreshModels,
  };
}
