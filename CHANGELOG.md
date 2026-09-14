# Changelog

## [Unreleased]

## [0.1.3] - 2026-09-14

### Changed

- Transferred the source repository to the VancineAI GitHub organization.
- Updated the package repository and issue tracker metadata to `https://github.com/VancineAI/vancine-pi-provider`.
- No runtime code changed in this release.

## [0.1.2] - 2026-09-11

### Changed

- The offline fallback now publishes `deepseek-flash` (display name DeepSeek V4.1 Flash) in place of the retired `deepseek-v4-flash-vision-exp` entry, matching the platform Pi catalog metadata for that model: text + image input, reasoning, 1,000,000 context window, 384,000 max output.
- The `deepseek-flash` fallback entry declares `compat.supportsReasoningEffort = true`. No other fallback model gained the flag: they still leave it unset so Pi's own default applies, and `supportsDeveloperRole` stays `false` for every model.
- Static fallback cost for `deepseek-flash` is input $0.24, output $0.96, cache read $0.0048 per MTok (cache write 0; no cache-write rate is published).
- The GLM-5.3-Flash half-price promotion has ended, so its static fallback cost is updated to input $0.12, output $0.40, cache read $0.024 per MTok.
- Refreshed the recorded fact sources for both models against the public `GET https://vancine.com/api/pricing` snapshot taken 2026-09-11T02:09:31Z.

These changes affect only the first-run offline fallback snapshot. The normal `/model` listing still comes from the live `GET https://vancine.com/api/pi/catalog`, whose model list and prices are served by the platform and do not depend on what this package ships.

## [0.1.1] - 2026-08-31

### Fixed

- Starting Pi after an npm install of this extension failed to load the package. The runtime imported `@earendil-works/pi-ai/api/openai-completions.lazy`, which Pi 0.84.4 does not expose as a virtual module. Runtime imports now use the Pi-supported `@earendil-works/pi-ai/compat` entry.

## [0.1.0] - 2026-08-31

### Added

- Initial Vancine Pi provider extension.
- `/login` API-key authentication through Pi's credential store.
- Dynamic `/model` catalog from production `GET https://vancine.com/api/pi/catalog`.
- ETag / Last-Modified revalidation, 4-hour freshness window, and last-success cache including a legitimate empty catalog.
- Safe cache restore that rebuilds models onto `https://vancine.com/v1` and rejects secret or malformed snapshots.
- Four-model offline fallback used only when there is no Pi catalog cache, network refresh is allowed, and that first catalog request fails.
