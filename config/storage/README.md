# Recipe photo transfer CORS

`production-cors.json` is the reviewed configuration for
`gs://misechef-fa4bf.firebasestorage.app`. Its origins are the canonical Production
origin and default Hosting origin defined in `scripts/productionDeploymentSafety.mjs`.
It preserves the same upload methods/headers used by the existing Beta CORS policy.
No wildcard, localhost, preview, or cross-environment origin is permitted.

This file does not change a live bucket. Firebase Storage Rules deployment does
not apply bucket CORS. During a separately authorized protected Production release,
apply this configuration with:

```sh
gcloud storage buckets update gs://misechef-fa4bf.firebasestorage.app --cors-file=config/storage/production-cors.json
```

Read back the bucket CORS configuration and verify an actual Recipe image GET
returns `Access-Control-Allow-Origin` for each approved origin. Also verify an
unapproved origin does not receive that header. Do not change Beta's existing
bucket CORS policy or Storage security rules.
