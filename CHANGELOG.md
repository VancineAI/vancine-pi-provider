# Changelog

## [Unreleased]

## [0.1.0] - 2026-08-31

### Added

- Initial Vancine Pi provider extension.
- `/login` API-key authentication through Pi's credential store.
- Dynamic `/model` catalog from production `GET https://vancine.com/api/pi/catalog`.
- ETag / Last-Modified revalidation, 4-hour freshness window, and last-success cache including a legitimate empty catalog.
- Safe cache restore that rebuilds models onto `https://vancine.com/v1` and rejects secret or malformed snapshots.
- Four-model offline fallback used only when there is no Pi catalog cache, network refresh is allowed, and that first catalog request fails.
