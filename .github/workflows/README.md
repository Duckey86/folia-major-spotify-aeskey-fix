# Actions in the Soloist fork

The personal Soloist build uses version `0.7.23-soloist.1`. Importing upstream release files does not authorize publishing Realeco, AUR, or Docker releases from this fork.

## Validation and publication policy

| Workflow | Fork behavior |
| --- | --- |
| [PR Unit Tests](pr-unit-tests.yml) | Unchanged: root TypeScript and unit tests, plus sync-server typechecking, run on pull requests and main pushes. No publication secrets are needed. |
| [Docker stack check](docker-stack-check.yml) | Unchanged: version, Compose, local image builds, and smoke tests run for relevant pull requests or manual dispatch. Images are not pushed. |
| [Linux arm64 package check](linux-arm64-package-check.yml) | Unchanged: relevant pull requests and manual dispatch build and inspect packages with `--publish never`. |
| [Code Map](codemap-sync.yml) | Regenerates the map with the built-in read-only token. It commits and pushes only in `chthollyphile/folia-major`, when `CODEMAP_PUSH_TOKEN` is available. Forks do not need that PAT. |
| [Realeco](electron-release.yml) | Upstream-only, including manual dispatch and the dependent AUR job. Stable-version and release-message checks remain intact. |
| [Limo](nightly-pre-release.yml), [release candidate](release-candidate.yml) | Upstream-only, including scheduled and manual runs. |
| [Cielo](canary-pre-release.yml) | Forks can manually select `artifacts` for a package build. Pushes, including `[canary]` commits, cannot publish; `rolling` and `branch-release` are upstream-only. Only the upstream publish job receives `contents: write`. These generic channel artifacts are not the manually verified Soloist installer. |
| [Docker stack publication](docker-stack-publish.yml) | Fork publication requires `ENABLE_DOCKER_STACK_PUBLISH=true`, a manual dispatch on `main`, and `confirm_publish=true`. |
| [Sync-server Docker publication](sync-server-docker-publish.yml) | Fork publication requires `ENABLE_SYNC_SERVER_DOCKER_PUBLISH=true`, a manual dispatch on `main`, and `confirm_publish=true`. |

Leave both Docker repository variables unset for the personal Windows build. If Docker publication is deliberately enabled later, configure the fork owner's `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` secrets. The existing stable-version, branch, and duplicate-tag checks still apply. `force_republish` does not bypass the fork opt-in. Upstream keeps its existing automatic Docker publication behavior.

The upstream desktop-channel workflows do not publish Soloist releases. Keep the `-soloist.1` package version and use a separately reviewed Soloist release process when publication is wanted.

## Confirmed failures after PR #3

The runs below executed merge commit `d54629b61463a3640211f3e1ddf36de830d86cc8`. Its tree matches the locally audited integration commit `59c9b1ca4e3f8efebaddf2bea6feb3f5434c1e6f`.

| Job and log | Confirmed cause |
| --- | --- |
| [Code Map / Regenerate code map](https://github.com/Duckey86/folia-major-spotify-aeskey-fix/actions/runs/41061297356/job/124081414686) | Checkout failed with `Input required and not supplied: token`. The explicit `secrets.CODEMAP_PUSH_TOKEN` input evaluated empty. Generation and push steps never ran; this was not a branch-protection or generator failure. |
| [Docker / Validate Docker stack release](https://github.com/Duckey86/folia-major-spotify-aeskey-fix/actions/runs/41061296767/job/124081412606) | `IMAGE_NAMESPACE` was empty and the script exited with `DOCKERHUB_USERNAME is not configured.` The main-branch and version checks had passed. Login, build, and tag promotion never ran; the log does not establish whether `DOCKERHUB_TOKEN` exists. |
| [Realeco / Validate Realeco release metadata](https://github.com/Duckey86/folia-major-spotify-aeskey-fix/actions/runs/41061296845/job/124081412168) | The validator threw `Current complete commit message must exactly match release: vA.B.C.` PR #3 produced a merge message. Separately, the subsequent plain-version check would reject `0.7.23-soloist.1`, while `realeco-release` contains `0.7.23`. Draft creation, builds, and AUR publication were skipped. |

The merge changed `realeco-release` and `deploy/docker/VERSION`, activating both publication workflows' `push` path filters on `main`. Code Map runs on main pushes except changes confined to the generated map. None originally checked the repository identity.

The failed jobs had `contents: read` for Code Map and Docker, and `contents: write` for Realeco. These permissions did not cause the observed errors. Realeco uses the built-in `GITHUB_TOKEN`; only its optional AUR steps refer to `AUR_SSH_PRIVATE_KEY` and `AUR_REPO_SSH_URL`.

[The same merge's validation run](https://github.com/Duckey86/folia-major-spotify-aeskey-fix/actions/runs/41061296916) passed root typechecking, unit tests, and sync-server typechecking. Publication guards do not gate those jobs. GitHub evaluates dependent jobs only after their prerequisites succeed, so a skipped publication entry job also skips its dependent build and release jobs ([workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idneeds)).
