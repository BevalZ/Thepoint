# Add GitHub Pages Raw Fallback

## Goal

Allow public GitHub user-site articles to import when the `*.github.io` host is reset or blocked but the corresponding public repository remains reachable.

## Requirements

* Attempt the requested URL normally first.
* On network failure or non-success status for `<user>.github.io`, try the public raw repository `<user>/<user>.github.io` on `master`, then `main`.
* Map a trailing-slash page path to `index.html`.
* Parse relative assets against the raw file URL while preserving the original public URL in the returned Source metadata.
* Keep TLS verification enabled and limit fallback to exact `*.github.io` user-site hosts.
* Preserve the original network/status error when all fallbacks fail.

## Acceptance Criteria

* [x] The Lilian Weng harness URL maps to the verified raw `index.html` URL.
* [x] Non-GitHub Pages URLs do not get fallback candidates.
* [x] Existing page extraction tests remain green.
* [x] Live import returns substantial article text for the reported URL.

## Technical Approach

Add a pure GitHub Pages fallback candidate builder and a small fetch helper in `commands/extract.rs`. The fallback fetch returns both the HTML base URL and original public URL so relative images resolve while durable Source identity stays unchanged.

## Out of Scope

* Disabling TLS validation.
* Generic website proxying or scraping through third-party services.
* GitHub organization/project Pages repository discovery.
