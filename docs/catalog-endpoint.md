# Vancine Pi catalog endpoint

Production catalog, shipped in Vancine **v1.10.0**:

```
GET https://vancine.com/api/pi/catalog
```

This package does **not** treat `GET https://vancine.com/api/pricing` as a complete Pi catalog. The Pi catalog is generated from Vancine's live model availability, endpoint capabilities, prices, and verified static metadata.

The number of models is not fixed. A successful response is the current compatible Chat Completions set, not a permanent whitelist.

## Endpoint

- Public HTTPS JSON, origin `https://vancine.com` only.
- No API key required. If a future revision requires a key, send `Authorization` only to `https://vancine.com`.
- Supports `ETag` / `If-None-Match` and `Last-Modified` / `If-Modified-Since`.
- Returns `304 Not Modified` when the body is unchanged.
- This client refreshes at most every 4 hours unless Pi requests a forced refresh.

## Response

```json
{
  "provider": "vancine",
  "schemaVersion": 1,
  "generatedAt": "2026-08-31T12:26:10Z",
  "models": [
    {
      "id": "hy4-preview",
      "name": "Hy4 preview",
      "enabled": true,
      "available": true,
      "kind": "chat",
      "api": "openai-completions",
      "endpoint": "chat.completions",
      "input": ["text"],
      "reasoning": true,
      "contextWindow": 1024000,
      "maxTokens": 64000,
      "cost": {
        "input": 0.67,
        "output": 2.0,
        "cacheRead": 0.034,
        "cacheWrite": 0
      },
      "compat": {
        "supportsDeveloperRole": false
      }
    }
  ]
}
```

## Field rules

| Field | Meaning |
| --- | --- |
| `provider` | Must be `vancine`. |
| `schemaVersion` | Current version is `1`. |
| `kind` | `chat` for Pi main conversation models. Use `image`, `video`, `audio`, `tts`, `3d`, `embedding`, `rerank`, or `task` for everything else. |
| `api` | Chat models must be `openai-completions`. |
| `input` | Must include `text`. May include `image`. Other modalities are ignored by Pi. |
| `cost.*` | USD per million tokens. Do not send new-api ratios. |
| `compat.supportsDeveloperRole` | Vancine Chat Completions needs `false`. |
| `compat.supportsReasoningEffort` | Optional. Set only from a verified Vancine Chat Completions fact. |

Missing required fields fail the catalog parse. Clients must not invent context windows, output limits, prices, or compatibility flags.

Converted models are rebuilt onto `https://vancine.com/v1`. Cache restore does not trust stored `baseUrl`, `headers`, or other request-target fields. Cached snapshots must not contain credentials or `Authorization`.
