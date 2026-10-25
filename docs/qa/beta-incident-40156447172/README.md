# Proposed recovery for Beta run 40156447172

The Week Cover Upload UI candidate is `f006237f65c60d6a7d18a5970f3bfc53557db6b0`, tree `9469486349c39376db65e4d464b7721b255ad321`.

The protected Beta release passed both regression gates and the Store Sets authorization suite. Its full-resource deploy then received Cloud Run HTTP 500 errors updating getPublicStorePaymentResult and saveStoreManualPosOrder. Other Functions updates completed, including renderPublicStore. Hosting publication did not complete.

Observed incident state:

- Live manifest/source: `5ad8fb98c9ad16f60124a772477e6c20a55725a4`.
- Root entry: `/assets/index-DHNm0rBK.js`.
- Public Store shell entry: `/assets/index-cTnS2l_l.js`.
- Current Hosting version: `sites/misechef-beta-fa4bf/versions/53b4f9a5d93ad3a0`.
- renderPublicStore revision: `renderpublicstore-00230-nus`.
- The Store asset request currently falls back to HTML rather than the requested JavaScript. Its observed response hash is pinned in the incident guard.

The normal coherence guard correctly refuses a mixed release. The standard retry was cancelled before deployment. No normal gate, baseline authority or permissions have been changed. Production is still on `5965b3db695a84efdff3ea1c25305f5736a36127`.

## Recovery proposal

The added workflow and controller follow the existing 20261010 incident recovery pattern. Execution requires release-owner approval of this specific exception to the normal AGENTS.md entry-point rule, review/merge of this controller into main, the required Beta environment review, and external bindings for the reviewed controller SHA and one-shot authorization. Those bindings have not been installed and recovery has not been dispatched.

The controller accepts only the pinned UI candidate SHA/tree, the recorded durable live state including response hashes and revision/version identifiers, the unchanged mandatory protected baseline, the Beta CI lock, and a matching one-shot authorization. Any drift stops execution. It builds the candidate afresh, runs the complete protected regression gate, retains Firebase permission preflight, and deploys Functions, Hosting, Firestore rules/indexes and Storage rules together. A consumed incident marker prevents reuse. Post-deployment checks require one coherent exact candidate release and matching artifact bytes.

It makes no menu, recipe, price, order, payment or dispatch data changes. Production credentials and deployments are excluded.

## Validation

58/58 incident/normal deployment safety tests passed, with zero failures or skips. Syntax checks passed for all new runtime/predeploy/import modules. The CI-equivalent dependency-resolution/import preflight passed using a clean candidate checkout and separately installed application/Functions dependencies; it stopped before any cloud probe/write/deploy. The existing normal deployBeta, betaDeploymentSafety and validateBetaPredeploy files are byte-unchanged from main.

The application's remaining cover upload/replacement/mobile save QA is separately gated on Chrome file-upload access or an uninterrupted native-picker session. This recovery proposal does not mark the UI ready for Production.
