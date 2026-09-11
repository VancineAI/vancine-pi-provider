import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FALLBACK_MODEL_IDS } from "../src/constants.ts";
import { FALLBACK_MODEL_FACTS, FALLBACK_MODELS } from "../src/fallback-models.ts";

const RETIRED_DEEPSEEK_IDS = [
  "deepseek-v4-flash",
  "deepseek-v4-pro",
  "deepseek-v4-flash-vision-exp",
] as const;

function byId(id: string) {
  return FALLBACK_MODELS.find((model) => model.id === id);
}

describe("fallback model facts", () => {
  it("contains exactly the four approved fallback ids in order", () => {
    assert.deepEqual(
      FALLBACK_MODELS.map((model) => model.id),
      ["hy4-preview", "deepseek-flash", "glm-5.3-flash", "qwen3.8-flash"],
    );
    assert.deepEqual([...FALLBACK_MODEL_IDS], FALLBACK_MODELS.map((model) => model.id));
  });

  it("lists deepseek-flash and none of the retired deepseek ids", () => {
    assert.ok(byId("deepseek-flash"), "deepseek-flash must be in the offline fallback");
    for (const retired of RETIRED_DEEPSEEK_IDS) {
      assert.equal(byId(retired), undefined, `${retired} must not return through fallback`);
    }
  });

  it("publishes the verified production prices for the refreshed models", () => {
    assert.deepEqual(byId("deepseek-flash")?.cost, {
      input: 0.24,
      output: 0.96,
      cacheRead: 0.0048,
      cacheWrite: 0,
    });
    assert.deepEqual(byId("glm-5.3-flash")?.cost, {
      input: 0.12,
      output: 0.4,
      cacheRead: 0.024,
      cacheWrite: 0,
    });
  });

  it("declares supportsReasoningEffort only where the catalog publishes it", () => {
    assert.deepEqual(byId("deepseek-flash")?.compat, {
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
    });
    for (const model of FALLBACK_MODELS) {
      assert.equal(model.compat?.supportsDeveloperRole, false);
      if (model.id === "deepseek-flash") {
        continue;
      }
      assert.equal(
        (model.compat as { supportsReasoningEffort?: boolean }).supportsReasoningEffort,
        undefined,
        `${model.id} must keep Pi's own reasoning-effort default`,
      );
    }
  });

  it("uses snapshot metadata from recorded sources rather than uniform defaults", () => {
    const windows = new Set(FALLBACK_MODELS.map((model) => model.contextWindow));
    const maxTokens = new Set(FALLBACK_MODELS.map((model) => model.maxTokens));
    const prices = new Set(FALLBACK_MODELS.map((model) => model.cost.input));
    assert.ok(windows.size >= 2);
    assert.ok(maxTokens.size >= 2);
    assert.ok(prices.size >= 2, "fallback prices must not be one uniform guessed rate");

    for (const model of FALLBACK_MODELS) {
      const facts = FALLBACK_MODEL_FACTS[model.id as keyof typeof FALLBACK_MODEL_FACTS];
      assert.ok(facts.urlOrPath);
      assert.ok(facts.accessedAt);
      assert.equal(facts.kind, "fallback-snapshot");
      assert.deepEqual(facts.converted.id, model.id);
      assert.equal(facts.converted.name, model.name);
      assert.equal(facts.converted.reasoning, model.reasoning);
      assert.deepEqual(facts.converted.input, model.input);
      assert.equal(facts.converted.contextWindow, model.contextWindow);
      assert.equal(facts.converted.maxTokens, model.maxTokens);
      assert.deepEqual(facts.converted.cost, model.cost);
      assert.deepEqual(model.compat, facts.converted.compat);
      assert.equal(model.api, "openai-completions");
      assert.equal(model.provider, "vancine");
      assert.equal(model.baseUrl, "https://vancine.com/v1");
    }
  });

  it("marks vision fallback models with image input and text-only hy4 without it", () => {
    assert.deepEqual(byId("hy4-preview")?.input, ["text"]);
    assert.deepEqual(byId("deepseek-flash")?.input, ["text", "image"]);
    assert.deepEqual(byId("glm-5.3-flash")?.input, ["text", "image"]);
    assert.deepEqual(byId("qwen3.8-flash")?.input, ["text", "image"]);
    assert.equal(byId("hy4-preview")?.reasoning, true);
    assert.equal(byId("deepseek-flash")?.reasoning, true);
    assert.equal(byId("deepseek-flash")?.name, "DeepSeek V4.1 Flash");
    assert.equal(byId("deepseek-flash")?.contextWindow, 1_000_000);
    assert.equal(byId("deepseek-flash")?.maxTokens, 384_000);
  });

  it("records the verified api pricing ratios behind each refreshed cost", () => {
    const glm = FALLBACK_MODEL_FACTS["glm-5.3-flash"];
    assert.equal(glm.original.api_pricing_model_ratio, 0.06);
    assert.equal(glm.original.api_pricing_completion_ratio, 3.333333333333);
    assert.equal(glm.original.api_pricing_cache_ratio, 0.2);

    const deepseek = FALLBACK_MODEL_FACTS["deepseek-flash"];
    assert.equal(deepseek.original.api_pricing_model_ratio, 0.12);
    assert.equal(deepseek.original.api_pricing_completion_ratio, 4);
    assert.equal(deepseek.original.api_pricing_cache_ratio, 0.02);
  });
});
