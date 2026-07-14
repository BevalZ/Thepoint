# Add GitHub Pages Raw Fallback

## Goal

Allow public GitHub user-site articles to import when the `*.github.io` host is reset or blocked but the corresponding public repository remains reachable.

## Requirements

* Attempt the requested URL normally first.
* On network failure or non-success status for `<user>.github.io`, try the public repository `<user>/<user>.github.io` on `master`, then `main`.
* For each branch, accept either the raw file host or the unauthenticated GitHub Contents API so environments that block `raw.githubusercontent.com` can still read public content.
* Map a trailing-slash page path to `index.html`.
* Parse relative assets against the raw file URL while preserving the original public URL in the returned Source metadata.
* Keep TLS verification enabled and limit fallback to exact `*.github.io` user-site hosts.
* Preserve the original network/status error when all fallbacks fail.

## Acceptance Criteria

* [x] The Lilian Weng harness URL maps to the verified raw `index.html` URL.
* [x] Non-GitHub Pages URLs do not get fallback candidates.
* [x] Existing page extraction tests remain green.
* [x] Live import returns substantial article text for the reported URL.
* [x] Contents API payload mapping and Base64 decoding are covered by a deterministic unit test.

## Technical Approach

Add a pure GitHub Pages fallback candidate builder and fetch helpers in `commands/extract.rs`. Raw and Contents API transports race within each branch, while branch priority remains `master` then `main`. The fallback returns the raw HTML base URL and original public URL so relative images resolve consistently while durable Source identity stays unchanged.

## Out of Scope

* Disabling TLS validation.
* Generic website proxying or scraping through third-party services.
* GitHub organization/project Pages repository discovery.
