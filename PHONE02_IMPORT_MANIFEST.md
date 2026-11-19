# AI-PHONE-02 import manifest

SOURCE_REPOSITORY=vidift-max/tokensaver-ai
SOURCE_SHA=e3014c018baa6cc79c8f245ed27370cc966034cd
SOURCE_TREE_SHA=5ede56ec8ea9b20134be97cee71cea01ed975414
SOURCE_ZIP_SHA256=0f644a5007f9083c6e1ffc2ec3be7f46a3292f86b4a25a4900abbcf448abf7fa
DESTINATION_REPOSITORY=vidift-max/tokensaver-ai-phone-02
DESTINATION_BRANCH=phone-02/baseline-e3014c
DESTINATION_SHA=NOT_CREATED
INITIALIZATION_STATUS=BLOCKED

## Prepared package
- Original ZIP files: 167
- Included original files: 163
- Excluded original files: 4
- Prepared ZIP SHA-256: 61675f2fcf2ac24bf433b73d8633382ec93a7b8c28799a9431c19190969a2fbb
- The prepared ZIP contains original file bytes only; it does not rewrite source files.
- Archive root folder has been removed so the contents are ready to place at repository root.

## Exclusions
- `.github/workflows/ai-phone-01-final-validation.yml` — Phone-01 workflow, outside Phone-02 scope.
- `.github/workflows/ai-phone-02-attestation.yml` — manual-only attestation workflow pins stale TARGET_SHA `ebb8eeecfea087443c5f3eba7021e96cb5302fe7`, not the requested baseline; preserve separately until reviewed and retargeted explicitly.
- `.github/workflows/distributed-runner-lab.yml` — general distributed-runner lab workflow, not Phone-02-specific.
- `.github/workflows/phone-02b-toolchain.yml` — Phone-02B workflow, a separate target from AI-PHONE-02.

## Security audit
- No `.env`, `.pfx`, `.p12`, standalone `.pem`, `.key`, `.crt`, `.cer`, `.jks`, or keystore files were found.
- No AWS access-key pattern, GitHub token pattern, JWT bearer token, or connection string indicating a production host was identified.
- Two RSA private-key PEM blocks occur inside Rust `#[cfg(test)]` / integration-test fixtures in `services/ai-team-room/src/auth.rs` and `services/ai-team-room/tests/auth_postgres.rs`; they are test signing fixtures, not production credential files.
- CI workflows contain explicitly named disposable/local CI passwords and localhost PostgreSQL URLs. These are test-only literals, not production secrets.
- Static scanning is not a guarantee that every possible secret format is absent.

## Provenance checks
- GitHub confirms source commit `e3014c018baa6cc79c8f245ed27370cc966034cd` exists.
- Its recursive tree contains 167 blobs and 29 tree entries; the uploaded ZIP contains 167 files.
- Git blob SHA-1 matched exactly for five representative Phone-02 files: Supervisor implementation, Team Room phone API, R5 workflow, release MSIX builder, and final checkpoint document.
- Full per-file hash comparison for all 167 files was not completed; therefore full ZIP-to-commit byte identity is not claimed.

## Destination and publication
- Destination repository is empty (`size=0`, no branches returned); its configured default branch name is `v2-saas-alpha`.
- GitHub metadata reports `admin=true` and `push=true`.
- Available GitHub commit operation requires a parent SHA, so it cannot create the required orphan/root commit in the empty repository.
- No branch, file, or commit was created. No merge, deploy, signing, OIDC setup, Team Room provisioning, or device activation was performed.
CI trigger checkpoint — 2026-11-19
