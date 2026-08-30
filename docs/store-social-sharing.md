# Store social sharing previews

Public Store routes (`/store/:slug`) are served through the `renderPublicStore` HTTP Function before the normal Hosting SPA fallback. The Function reads the matching Store document by slug, selects only its public branding fields, injects Store-specific Open Graph, Twitter Card, page-title, and canonical tags into the built Vite application shell, and returns that shell as the initial HTML response.

The React application then boots normally from the same HTML. Existing Store routes, products, cart, checkout, Copy Link, and QR behavior remain on the canonical `/store/:slug` URL.

## Public metadata fields

- Title: Store name, with `MiseChef Store` as the missing-Store fallback.
- Description: Store description, with a neutral Store-ordering fallback when empty.
- Image priority: valid HTTPS Store cover, valid HTTPS Store logo, then `/assets/store-share-default.png` on the current MiseChef origin.
- Store cover/logo URLs receive a cache-version query derived from the existing Store `updatedAt` value, so replacing a branding image produces a new crawler image URL without adding a social-only field.
- Canonical URL: the current approved MiseChef Hosting origin plus `/store/:slug`; query strings are excluded.

Only Store name, description, slug, cover URL, and logo URL are read into the renderer. Workspace membership, owner identifiers, contacts, settings, products, orders, payments, and Host earnings are not included.

## Build and deployment coupling

`npm run build` and `npm run build:beta` copy the generated Vite `dist/index.html` into `functions/generated/publicStoreAppShell.html`. The Functions predeploy hook repeats this preparation. Hosting and Functions must be released together so the server shell references the same hashed assets as the Hosting release. The Beta deployment script enforces `--only functions,hosting`.

This adds no new Firebase product, collection, index, Storage rule, or Firestore rule. It adds one public second-generation HTTP Function. An uncached direct Store-page request uses one Function invocation and one indexed Store query. Firebase Hosting may reuse the rendered response for up to 60 seconds.

## QA and cached previews

Verify the server response rather than only the hydrated browser DOM:

```sh
curl -sS -A 'facebookexternalhit/1.1' https://HOST/store/STORE-SLUG
```

Confirm the raw response contains the expected `og:*`, `twitter:*`, and canonical tags before `</head>`, and that every image is an absolute HTTPS URL.

Social networks cache previews independently from MiseChef. After updating Store branding:

- use the platform's link-preview debugger or re-scrape control where available;
- for a one-off QA cache bypass, append a harmless query such as `?preview=TIMESTAMP`—the returned `og:url` and canonical URL remain the clean Store URL;
- platforms without a re-scrape control may require waiting for their cache to expire or sharing the temporary query variant during QA.

The MiseChef response itself re-reads current Store metadata after its short Hosting cache window; external platform caches are not controlled by Firebase or the application.
