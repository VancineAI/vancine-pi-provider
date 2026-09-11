# pi-provider-vancine

Use Vancine from Pi through `/login` and a dynamic `/model` list, without writing `~/.pi/agent/models.json`.

## Install

```bash
pi install npm:pi-provider-vancine
```

Then start Pi.

## Log in

1. In Pi, run `/login`.
2. Choose **Vancine**.
3. Paste your Vancine API key into the secret prompt.
4. Pi stores the key in its credential store. This extension does not write its own credential file.

## Choose a model

1. Run `/model`.
2. Select a model under the **Vancine** provider.
3. You do not need to create or edit `models.json` for this basic path.

`/model` loads Vancine's current compatible Chat Completions models from the production catalog at `https://vancine.com/api/pi/catalog`. The list is not a hardcoded whitelist.

## Catalog refresh and fallback

The live source is `GET https://vancine.com/api/pi/catalog`. See [docs/catalog-endpoint.md](docs/catalog-endpoint.md).

- This provider refreshes the catalog at most every 4 hours, and sends `If-None-Match` / `If-Modified-Since` when it already has validators.
- A forced refresh is whatever Pi itself supports, such as `pi update --models`. This package does not add a separate refresh command.
- When a catalog request succeeds, `/model` shows the compatible Chat Completions models from that response, including a legitimate empty list.
- If a later catalog request fails, Pi keeps the last successful cached catalog, including a cached empty list. This extension does not overwrite a valid cache with fallback models.
- The four-model fallback is used only when there is no cache at all, network refresh is allowed, and that first catalog request fails:
  - `hy4-preview`
  - `deepseek-flash`
  - `glm-5.3-flash`
  - `qwen3.8-flash`
- Offline startup without a cache shows no Vancine models until a network refresh is attempted.
- After a successful catalog refresh, delisted models disappear and are not revived by fallback.

The catalog is not guaranteed to be realtime and can fail. Fallback models are a static first-run snapshot, not live model sync.

## Vancine API

| | |
| --- | --- |
| Base URL | `https://vancine.com/v1` |
| Protocol | OpenAI-compatible Chat Completions |
| Register | [https://vancine.com](https://vancine.com) |
| API keys | [https://vancine.com/console](https://vancine.com/console) |
| Models and pricing | [https://vancine.com/docs/models](https://vancine.com/docs/models) |
| Public pricing JSON | [https://vancine.com/api/pricing](https://vancine.com/api/pricing) |
| Agent notes | [https://vancine.com/docs/agents](https://vancine.com/docs/agents) |

## Security

- The API key is stored by Pi's credential store after `/login`.
- This extension does not keep its own copy of the key, does not put the key in the model cache, and does not send the key to catalog, npm, GitHub, Models.dev, or other third-party hosts.
- Authorization is only used for Vancine API requests that Pi itself sends to `https://vancine.com`.
- This package has no telemetry, analytics, install scripts, or automatic edits to your Pi settings.

## Troubleshooting

**Provider does not appear in `/login`**

- Confirm the package is installed: `pi list`.
- Restart Pi after install.
- Check that the extension was not disabled in `pi config`.

**No models after `/login`**

- Run `/model` after login. Models are listed only when Vancine auth is configured.
- If this is a first run, network refresh is allowed, and the catalog request fails, you should see the four offline fallback models.
- If a previous successful refresh stored an empty compatible catalog, `/model` stays empty.

**Model catalog is temporarily unavailable**

- Pi keeps the last successful catalog when one exists, including an empty catalog.
- First run without a cache, after a failed network refresh, uses the four offline snapshot models. That is not live sync.
- The catalog can fail; it is not claimed to be always live.

**API key is invalid**

- Create or copy a key from the Vancine console.
- Run `/login` again and choose Vancine.
- This extension never prints the full key in errors.

**Compatibility errors**

- Vancine Chat Completions is OpenAI-compatible. This provider sets `supportsDeveloperRole: false` so Pi sends `system` instead of `developer`.
- `supportsReasoningEffort` is not force-disabled. In the offline fallback only `deepseek-flash` declares it as `true` (a verified Vancine Chat Completions fact); every other model leaves it unset so Pi's own default still applies. The live catalog carries the same per-model value.
- If a specific model rejects a reasoning parameter, report it with the model id and error text (redact the key).

## Update

```bash
pi update npm:pi-provider-vancine
```

## Remove

```bash
pi remove npm:pi-provider-vancine
```

## Independence

Vancine is an independent OpenAI-compatible API service.

This package is a community extension published and maintained by Vancine. It is not a built-in Pi provider.

It is not an official extension, partnership, certification, or endorsement by Pi, Earendil Works, or their maintainers.

Listing on Models.dev or any other directory is not an official partnership, endorsement, or approval by Pi or Earendil Works.

This package does not claim that Vancine is built into Pi, that Pi has officially endorsed it, or that every dynamic model was paid-tested in this release.
