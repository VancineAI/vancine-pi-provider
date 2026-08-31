import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FALLBACK_MODEL_IDS } from "../src/constants.ts";
import { FALLBACK_MODEL_FACTS, FALLBACK_MODELS } from "../src/fallback-models.ts";

describe("fallback model facts", () => {
  it("contains exactly the four approved fallback ids in order", () => {
    assert.deepEqual(
      FALLBACK_MODELS.map((model) => model.id),
      ["hy4-preview", "deepseek-v4-flash-vision-exp", "glm-5.3-flash", "qwen3.8-flash"],
    );
    assert.deepEqual([...FALLBACK_MODEL_IDS], FALLBACK_MODELS.map((model) => model.id));
  });

  it("uses snapshot metadata from recorded sources rather than uniform defaults", () => {
    const windows = new Set(FALLBACK_MODELS.map((model) => model.contextWindow));
    const maxTokens = new Set(FALLBACK_MODELS.map((model) => model.maxTokens));
    const prices = new Set(FALLBACK_MODELS.map((model) => model.cost.input));
    assert.ok(windows.size >= 2);
    assert.ok(maxTokens.size >= 2);
    assert.ok(prices.size === 4);

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
      assert.deepEqual(model.compat, { supportsDeveloperRole: false });
      assert.equal(model.api, "openai-completions");
      assert.equal(model.provider, "vancine");
      assert.equal(model.baseUrl, "https://vancine.com/v1");
    }
  });

  it("marks vision fallback models with image input and text-only hy4 without it", () => {
    const byId = Object.fromEntries(FALLBACK_MODELS.map((model) => [model.id, model]));
    assert.deepEqual(byId["hy4-preview"]?.input, ["text"]);
    assert.deepEqual(byId["deepseek-v4-flash-vision-exp"]?.input, ["text", "image"]);
    assert.deepEqual(byId["glm-5.3-flash"]?.input, ["text", "image"]);
    assert.deepEqual(byId["qwen3.8-flash"]?.input, ["text", "image"]);
    assert.equal(byId["hy4-preview"]?.reasoning, true);
    assert.equal(byId["deepseek-v4-flash-vision-exp"]?.reasoning, true);
  });
});
