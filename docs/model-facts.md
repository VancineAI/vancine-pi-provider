# Fallback model facts

These four records are an **offline fallback snapshot** used only when there is no Pi catalog cache, network refresh is allowed, and that first catalog request fails. They are not a live catalog and not a permanent whitelist.

Normal `/model` listings come from `GET https://vancine.com/api/pi/catalog`. This file does not maintain the complete current model list.

Snapshot accessed 2026-08-31 for `hy4-preview` and `qwen3.8-flash`; re-verified and refreshed on 2026-09-11 for `deepseek-flash` and `glm-5.3-flash`.

`cacheWrite` is `0` because those sources published cache write as n/a, not because a write rate was guessed.

`compat.supportsDeveloperRole` is `false` from the known Vancine OpenAI-compatible Chat Completions behavior. It is a provider fact, not a per-model guess. `supportsReasoningEffort` is left unset so Pi's URL/provider auto-detect remains, except for `deepseek-flash`, where the Vancine catalog publishes `true`: the Chat Completions request contract defines `reasoning_effort` and `thinking`, and the DeepSeek adaptor passes an explicitly supplied field through untouched for ids without a `deepseek-v4-*` suffix.

Pi `input` only allows `text` and `image`. Source video/pdf inputs were dropped; image was kept when the source listed it.

| Model | Name | input | reasoning | contextWindow | maxTokens | cost input/output/cacheRead/cacheWrite | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- |
| hy4-preview | Hy4 preview | text | true | 1024000 | 64000 | 0.67 / 2.00 / 0.034 / 0 | `models/tencent/hy4-preview.toml`, `providers/vancine/models/hy4-preview.toml` (comments accessed 2026-08-30), live `/api/pricing` 2026-08-31T08:00:34Z |
| deepseek-flash | DeepSeek V4.1 Flash | text, image | true | 1000000 | 384000 | 0.24 / 0.96 / 0.0048 / 0 | `models/deepseek/deepseek-v4.1-flash.toml`, `providers/vancine/models/deepseek-flash.toml` (accessed 2026-09-11), live `/api/pricing` 2026-09-11T02:09:31Z (ModelRatio 0.12, CompletionRatio 4, CacheRatio 0.02) |
| glm-5.3-flash | GLM-5.3-Flash | text, image | true | 1000000 | 131072 | 0.12 / 0.40 / 0.024 / 0 | `models/zhipuai/glm-5.3-flash.toml`, `providers/vancine/models/glm-5.3-flash.toml` (accessed 2026-09-11), live models.dev `vancine` + `/api/pricing` 2026-09-11T02:09:31Z (ModelRatio 0.06, CompletionRatio 3.333333333333, CacheRatio 0.2) |
| qwen3.8-flash | Qwen3.8 Flash | text, image | true | 1000000 | 131072 | 0.12 / 0.38 / 0.013 / 0 | `models/alibaba/qwen3.8-flash.toml`, `providers/vancine/models/qwen3.8-flash.toml` (2026-08-27), live models.dev `vancine` + `/api/pricing` 2026-08-31 |

models.dev was **not** used as the runtime catalog source. Live models.dev `vancine` on 2026-08-31 listed 8 models and did **not** include `hy4-preview` or `deepseek-v4-flash-vision-exp`.

The GLM-5.3-Flash half-price promotion ended before the 2026-09-11 refresh, so its fallback cost is the regular production rate, not the promotional one.
