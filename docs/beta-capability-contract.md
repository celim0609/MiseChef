# Beta capability contract

`config/beta-capabilities.json` is the machine-readable minimum capability set for the current protected Beta release. `config/beta-capability-authority.json` and the validator's mandatory authority constant pin the accepted contract to an immutable Git commit, so deleting an entry from the candidate copy or casually repointing the manifest cannot hide a regression. Candidate source and Firebase configuration may add capabilities. Every protected entry must continue to resolve unless an explicit approved removal exists.

The contract uses stable identifiers for product capabilities and their source/infrastructure evidence. It protects source modules, Firebase Function exports, Firestore and Storage rule capabilities, indexes, Hosting rewrites, routes, and navigation targets. Display copy is not the contract.

## Intentional removals

Intentional removal uses `config/beta-capability-removals.json`. A removal record must identify the exact contract entry, include a non-empty reason, reviewer, review reference, approval timestamp, and target release, and set `approved` to `true`. Removing a requirement from source without that record fails validation. Deleting a requirement from the protected contract is not a removal mechanism.

## Additive development

New Functions, routes, indexes, rewrites, modules, payment methods, delivery capabilities, Store options, or other features are allowed. They become protected only when an accepted Beta release intentionally advances the authority pin to the dedicated commit containing the expanded contract.

Advancing the contract is a release-authority action:

1. Prove the candidate retains the current contract and passes all protected tests.
2. Deploy and complete live Beta QA through the protected release workflow.
3. Approve the new Beta release.
4. Update the external protected baseline.
5. Update the repository baseline and capability contract in a dedicated follow-up stability commit.
6. Point `config/beta-capability-authority.json` at that accepted contract commit.

Never weaken or delete validator checks merely to make a candidate pass.
