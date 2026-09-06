# Production Firestore read containment runbook

Status: prepared only. No logging setting, alert, migration, inspection, or Production deployment is executed by this document.

## Guarded utility requirement

Any repository utility that reads Production Firestore data must route every document read and collection page through `scripts/productionFirestoreReadSafety.mjs`. Raw Firestore REST, Web SDK, or Admin SDK collection reads are prohibited in Production-capable scripts.

A run must:

1. pin `projectId` to `misechef-fa4bf`;
2. receive the exact operator confirmation `READ PRODUCTION FIRESTORE misechef-fa4bf FOR <run-id>`, bound to the same explicit run ID used in telemetry (never a hard-coded value, default, or implicit environment fallback);
3. provide explicit `pageSize`, `maxPages`, `maxPagesPerCollection`, `maxDocumentsPerCollection`, `maxRequests`, and `maxDocuments` values below the hard ceilings;
4. use a unique run ID tied to the approved change or incident;
5. retain the structured start, request, collection-complete, and run-complete telemetry, including request/page/document totals and a machine-readable abort reason for failed runs;
6. stop on repeated/non-advancing page tokens, empty cursor pages, overlapping document pages, or any request/document ceiling;
7. never log document bodies, IDs, access tokens, or customer data.

Before a future Beta-to-Production migration is executable, its inspection, preflight, apply verification, and rollback verification reads must use the guard and its policy tests must pass. The policy scans all repository utilities rather than trusting a Production-looking filename; only clients pinned both to a `demo-*` project and `FIRESTORE_EMULATOR_HOST` are exempt. This runbook is not authorization to read or write Production.

## Prepare Firestore Data Read audit logging

Execution requires separate Production authorization by an owner with IAM/audit-log authority.

1. In Google Cloud Console, select project `misechef-fa4bf` and open **IAM & Admin → Audit Logs**.
2. Select the service entry for `datastore.googleapis.com`. Google documents this as the configuration service name for both Datastore and Firestore; emitted Firestore log entries use `firestore.googleapis.com`.
3. Enable **Data Read** logging for the identities that can run migrations, inspections, Admin SDK jobs, Firebase CLI utilities, and CI. Review any exemptions; an exemption for those identities would defeat incident attribution.
4. Save only after reviewing expected logging volume, cost, retention, and who has `Private Logs Viewer` access.
5. In Logs Explorer, verify a separately authorized, tightly bounded read produces a Data Access entry. Do not use a collection scan as the verification read.
6. Confirm the retained entry identifies timestamp, principal, method, resource/project, and caller metadata without exporting customer document contents.
7. Set an appropriate retention period or a restricted log sink so evidence survives the incident-review window.

Suggested Logs Explorer starting filter (validate against one bounded authorized event before relying on it):

```text
log_id("cloudaudit.googleapis.com/data_access")
protoPayload.serviceName="firestore.googleapis.com"
resource.labels.project_id="misechef-fa4bf"
```

Useful method filters include `google.firestore.v1.Firestore.RunQuery`, `google.firestore.v1.Firestore.GetDocument`, and `google.firestore.v1.Firestore.ListDocuments`. Keep the broader service filter available because SDK transports and method names can differ.

Reference: [Firestore audit logging](https://docs.cloud.google.com/firestore/native/docs/audit-logging).

## Prepare document-read volume alerts

Execution also requires separate Production authorization. Create alerts in Cloud Monitoring against `firestore.googleapis.com/document/read_ops_count`, scoped to project `misechef-fa4bf` and the `(default)` database. This metric counts successful document reads from queries or lookups; the legacy `firestore.googleapis.com/document/read_count` metric uses the older `firestore_instance` resource.

Prepare two policies, then calibrate thresholds against at least 30 days of normal traffic:

- warning: a sustained read rate materially above the normal peak for 10 minutes;
- critical: a rate capable of producing the daily cost/error budget within one hour, or an anomalous rate-of-change relative to the prior hour.

For each policy:

1. use a rolling sum/rate window rather than a single sample;
2. require the database/project resource labels;
3. notify the on-call owner and billing owner;
4. link this runbook and the Firestore Query/Usage Insights view;
5. include the current value, threshold, project, database, and incident start time;
6. test notification routing without generating Firestore traffic;
7. add a billing-budget alert as a backstop, not as the primary incident signal.

At alert time, capture Query/Usage Insights fingerprints, audit-log principal/method counts, deployments, workflow runs, and guarded run IDs before changing code or logs. A sudden `ListDocuments`/unfiltered collection fingerprint with one run ID should be stopped at its utility or credential source first.

Reference: [Cloud Monitoring Firestore metrics](https://docs.cloud.google.com/monitoring/api/metrics_gcp_d_h#firestore).

## Approval checklist for future migration work

- The migration branch is rebased on the current protected Beta line.
- Every Production read uses the guarded reader; the static policy test reports no raw operation.
- Per-collection expected counts fit well below explicit limits.
- Dry-run output contains only counts/digests and the run telemetry contains no customer data.
- Source Beta reads and destination Production reads are distinguished in telemetry.
- Apply and rollback remain separately confirmed and fail closed.
- Firestore Data Read audit logging and read-volume alerts are enabled and verified by an authorized operator.
- Protected Beta validation passes on the exact candidate commit.
- A separate explicit authorization is recorded before any Production read, write, migration, or deployment.
