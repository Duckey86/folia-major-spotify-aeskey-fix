# Folia v0.7.24 + Spotify Soloist integration

## Merge scope

- Working branch: `integrate/folia-v0.7.24-soloist`.
- Fork base: `9ec79c9f904fe2e48d3a4a0de95684f89eeb42ba` (merged fork CI safeguards).
- Upstream merge parent: `adf862150830a8acf635d83b03814e5ce6110e0b`, tag `v0.7.24`.
- Reviewed upstream range: `v0.7.23..v0.7.24`, 275 changed files, including Nebbia, Machi, subtitle layouts, remote queue, shared stem-analysis work, audio-output routing, and Spotify error wording.
- Package and both root lockfile versions: `0.7.24-soloist.1`.
- The merge remains uncommitted. No push, tag, release creation, or publication was performed.

## Every textual conflict

| File | Cause | Resolution |
| --- | --- | --- |
| [.gitignore](../.gitignore) | Both branches appended different ignore rules. | Retained all Soloist executable, credential, capture-output and CMake exclusions, plus upstream's generated Nebbia stroke-data exclusion. |
| [package.json](../package.json) | Fork version `0.7.23-soloist.1` versus upstream `0.7.24`. | Set `0.7.24-soloist.1`; retained the Soloist product identity, installer naming, capture build step, resource inclusion and disabled default publication. |
| [package-lock.json](../package-lock.json) | The same version conflict in the top-level and root-package entries. | Set both to `0.7.24-soloist.1`; preserved the dependency tree. |

No other textual merge conflicts were present. Automatically merged files were also checked at integration points; new features were not resolved by choosing one entire side.

## Preserved behavior and signal integration

The original [Soloist process manager](../electron/soloist/manager.cjs), [guided setup](../src/components/spotify/SoloistSetup.tsx), encrypted-key storage, [playback bridge](../src/services/onlineMusic/spotify/spotifySoloist.ts), Spotify error handling, capture protocol, and provider integration remain unchanged from the fork base. All fork workflow safeguards are byte-for-byte unchanged. Upstream remote queue commands retain the existing queue actions, provider-qualified identities and stale-row checks.

The [playback visualizer bridge](../src/components/app/playback/bridges/usePlaybackVisualizerBridge.ts) still reads external analysis only through Omni. It also feeds a bounded [live onset adapter](../src/services/beatFx/externalAudioReactivity.ts), without new React state, a second frame loop, PCM storage, model-result writes or platform-specific imports in shared visualizers.

| Consumer | Signal used |
| --- | --- |
| Nebbia rain | Existing vocal-frequency MotionValue; upstream separated vocal-envelope analysis remains preferred when available. |
| Nebbia vehicle bumps | Existing separated kick analysis, with a live low-frequency onset fallback. |
| Machi weather intensity | Existing audioPower MotionValue. |
| Machi neon | Existing model beat events, with recent live low-frequency onsets as fallback. |
| Machi ground ripples | Existing separated kicks, with live low-frequency onset estimates as fallback. |
| Machi screen lights | Existing separated snares, with live mid/high-frequency onset estimates as fallback. |

Live estimates are not separated stems or a musical downbeat grid. They are never persisted as such. Paused playback, stale capture, source changes, seeks, disabled effects, static mode and stored-results-only mode stop or reset the fallback. Upstream model-analysis paths remain available. External playback clocks do not subtract latency from the unrelated renderer audio graph.

Regression coverage includes distinct frequency inputs, pause/stale/source/seek resets, bounded history, actual Machi effect functions, Nebbia bumps and vocal normalization, and mixed-provider remote queue identity after reordering. Existing Spotify transition, repeat, skip, error, architecture and security tests were retained.

## Independent review

Two fresh read-only reviewers examined the complete integration. Usage limits interrupted their work; both were resumed to finish their existing round.

1. **Medium, confirmed and fixed:** after 32 captured onsets, trimming the history changed Machi screen-flash positions. A failing regression reproduced it. Stable absolute hit numbering now keeps existing flashes in place. The second review covered this fix.
2. **Medium, confirmed and fixed:** live low-frequency onsets allowed every 0.3 seconds were reselected by Machi's 0.33-second ripple filter after history trimming, replacing still-visible ripples. A failing regression reproduced it. The live minimum interval is now 0.35 seconds. The fix was self-tested and was not independently reviewed again; the project workflow caps review at two rounds.

Neither reviewer reported another confirmed medium/high issue. Architecture and security checks were not weakened.

## Validation and limitations

- `npm run typecheck`: passed on the final code.
- `npm run build`: passed; the final production build also rebuilt the renderer after review fixes.
- `npm run build:soloist-capture`: passed outside the sandbox. The first attempt failed because MSBuild could not read the installed Windows SDK metadata through the sandbox.
- `VITE_FOLIA_SOLOIST=1 npm run build:electron -- --win --publish never`: passed, including the final rebuild after review fixes.
- Focused Spotify, Omni, lyrics, remote queue and visualizer run: 1,358 passed, 1 skipped before the two review regressions were added.
- Initial full suite: 13,426 passed, 8 skipped, one Windows symlink privilege failure.
- A later concurrent-build run timed out in Machi's unmodified Kowloon geometry test at its existing five-second timeout. The test and timeout were not changed; the final full suite uses two workers to reduce contention.
- A new remote-queue test fixture initially omitted required `durationMs`; corrected, then TypeScript passed.
- Packaged desktop smoke: startup and restart with a fresh isolated profile passed; guided setup, preload bridges and remote queue expansion/collapse passed with zero renderer exceptions. No stored account or API key was used. A first smoke attempt called remote-window close from the main renderer and was correctly rejected; the harness was corrected to use the remote renderer.
- The Windows `modSignature` symlink test fails before its security assertion with `EPERM` in `fs.symlinkSync`. It also fails outside the sandbox. Run it in Administrator PowerShell with symlink privileges; no security test was skipped or weakened to hide it.
- No live Spotify account playback or subjective GPU visual-quality acceptance was performed in this isolated profile. The provided manual verification belongs to v0.7.23; this version's audio integration is covered by regressions and package/runtime checks.

## Package audit

- Installer: `release/Folia-Soloist-Setup-0.7.24-soloist.1.exe`.
- SHA-256: `02f5dd1a48b79aba175ae662614e5d4ad2d358cf33a384534cfed8e42634a25d`.
- Installer metadata and packaged application both report `0.7.24-soloist.1`.
- Packaged native capture helper matches the local compiled helper byte-for-byte.
- The compiled Soloist renderer gate is enabled; Nebbia, Machi, live-history fixes, stroke data and stroke licenses are present.
- Packaged renderer assets match the final build output. The package contains no personal `soloist.exe`.
- The original v0.7.23 installer retains SHA-256 `fea4a43c51877cb9b5ea70f5cf632bdf2adf960d03624838dbcb71d52964bb4b`.
- Source audit scanned 4,460 files before this report. No credential files, installers or native build outputs are tracked. Token-pattern hits were the existing synthetic triage-test values. The only new binary source asset is upstream's licensed Nebbia raindrop image.

## Final test result

`npm run test:unit -- --maxWorkers=2` completed in 294.39 seconds: **13,428 passed, 8 skipped, 1 failed** across 1,060 files (1,057 passed, 2 skipped, 1 failed). The sole failure is the unchanged Windows symlink privilege test described above. The Machi geometry timeout did not recur. Both live-history regression tests passed. The merge has no unresolved index entries or conflict markers, and staged/unstaged whitespace checks pass.

## Complete changed-file list

The following list is relative to the fork base, and includes all upstream changes and integration fixes.

- [.gitignore](../.gitignore)
- [AGENTS.md](../AGENTS.md)
- [README.en.md](../README.en.md)
- [README.md](../README.md)
- [deploy/docker/VERSION](../deploy/docker/VERSION)
- [dev/nebbia/nebbiaStrokesPlugin.mjs](../dev/nebbia/nebbiaStrokesPlugin.mjs)
- [dev/perf/scenarios.mjs](../dev/perf/scenarios.mjs)
- [dev/probes/lattice.probe.tsx](../dev/probes/lattice.probe.tsx)
- [dev/probes/loginWindow.probe.tsx](../dev/probes/loginWindow.probe.tsx)
- [dev/probes/subtitleOverlayRows.probe.tsx](../dev/probes/subtitleOverlayRows.probe.tsx)
- [docs/CODEMAP.md](../docs/CODEMAP.md)
- [docs/library-suites.md](../docs/library-suites.md)
- [docs/soloistV0724Integration.md](../docs/soloistV0724Integration.md)
- [electron/main.cjs](../electron/main.cjs)
- [electron/preload.cjs](../electron/preload.cjs)
- [electron/remoteControlWindowGeometry.cjs](../electron/remoteControlWindowGeometry.cjs)
- [package-lock.json](../package-lock.json)
- [package.json](../package.json)
- [realeco-release](../realeco-release)
- [skills/development-workflow/SKILL.md](../skills/development-workflow/SKILL.md)
- [src/App.tsx](../src/App.tsx)
- [src/components/app/lattice/lyrics/LatticeLyrics.tsx](../src/components/app/lattice/lyrics/LatticeLyrics.tsx)
- [src/components/app/lattice/lyrics/LatticeLyricsProvider.tsx](../src/components/app/lattice/lyrics/LatticeLyricsProvider.tsx)
- [src/components/app/lattice/lyrics/types.ts](../src/components/app/lattice/lyrics/types.ts)
- [src/components/app/playback/bridges/remoteQueueFeed.ts](../src/components/app/playback/bridges/remoteQueueFeed.ts)
- [src/components/app/playback/bridges/useElectronPlaybackBridge.ts](../src/components/app/playback/bridges/useElectronPlaybackBridge.ts)
- [src/components/app/playback/bridges/usePlaybackAudioBridge.ts](../src/components/app/playback/bridges/usePlaybackAudioBridge.ts)
- [src/components/app/playback/bridges/usePlaybackVisualizerBridge.ts](../src/components/app/playback/bridges/usePlaybackVisualizerBridge.ts)
- [src/components/app/playback/bridges/useRemoteQueueCommands.ts](../src/components/app/playback/bridges/useRemoteQueueCommands.ts)
- [src/components/app/playback/source/previewNotice.ts](../src/components/app/playback/source/previewNotice.ts)
- [src/components/command-palette/commands/libraryWallLookCommands.ts](../src/components/command-palette/commands/libraryWallLookCommands.ts)
- [src/components/command-palette/commands/visualizerCommands.ts](../src/components/command-palette/commands/visualizerCommands.ts)
- [src/components/command-palette/surfaces/libraryWallLookSurface.ts](../src/components/command-palette/surfaces/libraryWallLookSurface.ts)
- [src/components/command-palette/types.ts](../src/components/command-palette/types.ts)
- [src/components/login/window/PlatformColumn.tsx](../src/components/login/window/PlatformColumn.tsx)
- [src/components/modal/SettingsModal.tsx](../src/components/modal/SettingsModal.tsx)
- [src/components/modal/ThemePark.tsx](../src/components/modal/ThemePark.tsx)
- [src/components/modal/newFeaturesRelease.ts](../src/components/modal/newFeaturesRelease.ts)
- [src/components/modal/settings/ImportConfirmDialog.tsx](../src/components/modal/settings/ImportConfirmDialog.tsx)
- [src/components/modal/settings/pages/BravaisWallGroup.tsx](../src/components/modal/settings/pages/BravaisWallGroup.tsx)
- [src/components/modal/settings/pages/storage/visualConfigTransfer.ts](../src/components/modal/settings/pages/storage/visualConfigTransfer.ts)
- [src/components/modal/theme-park/ThemeParkPreview.tsx](../src/components/modal/theme-park/ThemeParkPreview.tsx)
- [src/components/modal/userGuideContent.ts](../src/components/modal/userGuideContent.ts)
- [src/components/obs/ObsBrowserSourceApp.tsx](../src/components/obs/ObsBrowserSourceApp.tsx)
- [src/components/obs/ObsWebSourceApp.tsx](../src/components/obs/ObsWebSourceApp.tsx)
- [src/components/panelTab/controls/AppearanceSection.tsx](../src/components/panelTab/controls/AppearanceSection.tsx)
- [src/components/remote/RemoteControlApp.tsx](../src/components/remote/RemoteControlApp.tsx)
- [src/components/remote/RemoteKeyRow.tsx](../src/components/remote/RemoteKeyRow.tsx)
- [src/components/remote/RemoteQueue.css](../src/components/remote/RemoteQueue.css)
- [src/components/remote/RemoteQueue.tsx](../src/components/remote/RemoteQueue.tsx)
- [src/components/remote/RemoteQueueRow.tsx](../src/components/remote/RemoteQueueRow.tsx)
- [src/components/remote/remote.css](../src/components/remote/remote.css)
- [src/components/remote/remoteQueueSearch.ts](../src/components/remote/remoteQueueSearch.ts)
- [src/components/remote/remoteWindowBridge.ts](../src/components/remote/remoteWindowBridge.ts)
- [src/components/remote/useRemoteQueue.ts](../src/components/remote/useRemoteQueue.ts)
- [src/components/visualizer/BeatEffectsGroup.tsx](../src/components/visualizer/BeatEffectsGroup.tsx)
- [src/components/visualizer/README.md](../src/components/visualizer/README.md)
- [src/components/visualizer/VisualizerSubtitleOverlay.tsx](../src/components/visualizer/VisualizerSubtitleOverlay.tsx)
- [src/components/visualizer/beatClockTargets.ts](../src/components/visualizer/beatClockTargets.ts)
- [src/components/visualizer/cadenza/VisualizerCadenza.tsx](../src/components/visualizer/cadenza/VisualizerCadenza.tsx)
- [src/components/visualizer/cappella/VisualizerCappella.tsx](../src/components/visualizer/cappella/VisualizerCappella.tsx)
- [src/components/visualizer/claddagh/VisualizerCladdagh.tsx](../src/components/visualizer/claddagh/VisualizerCladdagh.tsx)
- [src/components/visualizer/classic/Visualizer.tsx](../src/components/visualizer/classic/Visualizer.tsx)
- [src/components/visualizer/definition.ts](../src/components/visualizer/definition.ts)
- [src/components/visualizer/diorama/VisualizerDiorama.tsx](../src/components/visualizer/diorama/VisualizerDiorama.tsx)
- [src/components/visualizer/fume/VisualizerFume.tsx](../src/components/visualizer/fume/VisualizerFume.tsx)
- [src/components/visualizer/hanabi/VisualizerHanabi.tsx](../src/components/visualizer/hanabi/VisualizerHanabi.tsx)
- [src/components/visualizer/hanabi/collage/collagePainters.ts](../src/components/visualizer/hanabi/collage/collagePainters.ts)
- [src/components/visualizer/lucidePath2d.ts](../src/components/visualizer/lucidePath2d.ts)
- [src/components/visualizer/lumiere/VisualizerLumiere.tsx](../src/components/visualizer/lumiere/VisualizerLumiere.tsx)
- [src/components/visualizer/machi/MachiCameraBar.tsx](../src/components/visualizer/machi/MachiCameraBar.tsx)
- [src/components/visualizer/machi/MachiSettingsPanel.tsx](../src/components/visualizer/machi/MachiSettingsPanel.tsx)
- [src/components/visualizer/machi/VisualizerMachi.tsx](../src/components/visualizer/machi/VisualizerMachi.tsx)
- [src/components/visualizer/machi/cameraBar.ts](../src/components/visualizer/machi/cameraBar.ts)
- [src/components/visualizer/machi/cameraControls.ts](../src/components/visualizer/machi/cameraControls.ts)
- [src/components/visualizer/machi/createMachiRuntime.ts](../src/components/visualizer/machi/createMachiRuntime.ts)
- [src/components/visualizer/machi/engine/actors/nobori.ts](../src/components/visualizer/machi/engine/actors/nobori.ts)
- [src/components/visualizer/machi/engine/actors/schedules.ts](../src/components/visualizer/machi/engine/actors/schedules.ts)
- [src/components/visualizer/machi/engine/actors/traffic.ts](../src/components/visualizer/machi/engine/actors/traffic.ts)
- [src/components/visualizer/machi/engine/beatFx.ts](../src/components/visualizer/machi/engine/beatFx.ts)
- [src/components/visualizer/machi/engine/boardLayout.ts](../src/components/visualizer/machi/engine/boardLayout.ts)
- [src/components/visualizer/machi/engine/camera.ts](../src/components/visualizer/machi/engine/camera.ts)
- [src/components/visualizer/machi/engine/clock.ts](../src/components/visualizer/machi/engine/clock.ts)
- [src/components/visualizer/machi/engine/director.ts](../src/components/visualizer/machi/engine/director.ts)
- [src/components/visualizer/machi/engine/environment.ts](../src/components/visualizer/machi/engine/environment.ts)
- [src/components/visualizer/machi/engine/fx/ground.ts](../src/components/visualizer/machi/engine/fx/ground.ts)
- [src/components/visualizer/machi/engine/fx/lensPass.ts](../src/components/visualizer/machi/engine/fx/lensPass.ts)
- [src/components/visualizer/machi/engine/fx/lightCones.ts](../src/components/visualizer/machi/engine/fx/lightCones.ts)
- [src/components/visualizer/machi/engine/fx/post.ts](../src/components/visualizer/machi/engine/fx/post.ts)
- [src/components/visualizer/machi/engine/fx/postPasses.ts](../src/components/visualizer/machi/engine/fx/postPasses.ts)
- [src/components/visualizer/machi/engine/fx/reflection.ts](../src/components/visualizer/machi/engine/fx/reflection.ts)
- [src/components/visualizer/machi/engine/fx/steam.ts](../src/components/visualizer/machi/engine/fx/steam.ts)
- [src/components/visualizer/machi/engine/fx/weather.ts](../src/components/visualizer/machi/engine/fx/weather.ts)
- [src/components/visualizer/machi/engine/geometry/plinth.ts](../src/components/visualizer/machi/engine/geometry/plinth.ts)
- [src/components/visualizer/machi/engine/geometry/shapes.ts](../src/components/visualizer/machi/engine/geometry/shapes.ts)
- [src/components/visualizer/machi/engine/ledStrip.ts](../src/components/visualizer/machi/engine/ledStrip.ts)
- [src/components/visualizer/machi/engine/lens.ts](../src/components/visualizer/machi/engine/lens.ts)
- [src/components/visualizer/machi/engine/lyricScreen.ts](../src/components/visualizer/machi/engine/lyricScreen.ts)
- [src/components/visualizer/machi/engine/materials.ts](../src/components/visualizer/machi/engine/materials.ts)
- [src/components/visualizer/machi/engine/palette.ts](../src/components/visualizer/machi/engine/palette.ts)
- [src/components/visualizer/machi/engine/quality.ts](../src/components/visualizer/machi/engine/quality.ts)
- [src/components/visualizer/machi/engine/sheen.ts](../src/components/visualizer/machi/engine/sheen.ts)
- [src/components/visualizer/machi/engine/signRaster.ts](../src/components/visualizer/machi/engine/signRaster.ts)
- [src/components/visualizer/machi/engine/sky.ts](../src/components/visualizer/machi/engine/sky.ts)
- [src/components/visualizer/machi/engine/skyLights.ts](../src/components/visualizer/machi/engine/skyLights.ts)
- [src/components/visualizer/machi/engine/snow.ts](../src/components/visualizer/machi/engine/snow.ts)
- [src/components/visualizer/machi/entry.tsx](../src/components/visualizer/machi/entry.tsx)
- [src/components/visualizer/machi/machiTuning.ts](../src/components/visualizer/machi/machiTuning.ts)
- [src/components/visualizer/machi/scenes/index.ts](../src/components/visualizer/machi/scenes/index.ts)
- [src/components/visualizer/machi/scenes/konbini/base.ts](../src/components/visualizer/machi/scenes/konbini/base.ts)
- [src/components/visualizer/machi/scenes/konbini/interior.ts](../src/components/visualizer/machi/scenes/konbini/interior.ts)
- [src/components/visualizer/machi/scenes/konbini/konbiniDoor.ts](../src/components/visualizer/machi/scenes/konbini/konbiniDoor.ts)
- [src/components/visualizer/machi/scenes/konbini/konbiniLights.ts](../src/components/visualizer/machi/scenes/konbini/konbiniLights.ts)
- [src/components/visualizer/machi/scenes/konbini/konbiniScene.ts](../src/components/visualizer/machi/scenes/konbini/konbiniScene.ts)
- [src/components/visualizer/machi/scenes/konbini/konbiniSeed.ts](../src/components/visualizer/machi/scenes/konbini/konbiniSeed.ts)
- [src/components/visualizer/machi/scenes/konbini/konbiniSignPaint.ts](../src/components/visualizer/machi/scenes/konbini/konbiniSignPaint.ts)
- [src/components/visualizer/machi/scenes/konbini/konbiniSigns.ts](../src/components/visualizer/machi/scenes/konbini/konbiniSigns.ts)
- [src/components/visualizer/machi/scenes/konbini/layout.ts](../src/components/visualizer/machi/scenes/konbini/layout.ts)
- [src/components/visualizer/machi/scenes/konbini/props.ts](../src/components/visualizer/machi/scenes/konbini/props.ts)
- [src/components/visualizer/machi/scenes/konbini/store.ts](../src/components/visualizer/machi/scenes/konbini/store.ts)
- [src/components/visualizer/machi/scenes/kowloon/bar.ts](../src/components/visualizer/machi/scenes/kowloon/bar.ts)
- [src/components/visualizer/machi/scenes/kowloon/blocks.ts](../src/components/visualizer/machi/scenes/kowloon/blocks.ts)
- [src/components/visualizer/machi/scenes/kowloon/hologram.ts](../src/components/visualizer/machi/scenes/kowloon/hologram.ts)
- [src/components/visualizer/machi/scenes/kowloon/kowloonLights.ts](../src/components/visualizer/machi/scenes/kowloon/kowloonLights.ts)
- [src/components/visualizer/machi/scenes/kowloon/kowloonScene.ts](../src/components/visualizer/machi/scenes/kowloon/kowloonScene.ts)
- [src/components/visualizer/machi/scenes/kowloon/kowloonSignPaint.ts](../src/components/visualizer/machi/scenes/kowloon/kowloonSignPaint.ts)
- [src/components/visualizer/machi/scenes/kowloon/kowloonSigns.ts](../src/components/visualizer/machi/scenes/kowloon/kowloonSigns.ts)
- [src/components/visualizer/machi/scenes/kowloon/layout.ts](../src/components/visualizer/machi/scenes/kowloon/layout.ts)
- [src/components/visualizer/machi/scenes/kowloon/street.ts](../src/components/visualizer/machi/scenes/kowloon/street.ts)
- [src/components/visualizer/machi/scenes/station/layout.ts](../src/components/visualizer/machi/scenes/station/layout.ts)
- [src/components/visualizer/machi/scenes/station/stationLights.ts](../src/components/visualizer/machi/scenes/station/stationLights.ts)
- [src/components/visualizer/machi/scenes/station/stationScene.ts](../src/components/visualizer/machi/scenes/station/stationScene.ts)
- [src/components/visualizer/machi/scenes/station/stationSeed.ts](../src/components/visualizer/machi/scenes/station/stationSeed.ts)
- [src/components/visualizer/machi/scenes/station/stationSignPaint.ts](../src/components/visualizer/machi/scenes/station/stationSignPaint.ts)
- [src/components/visualizer/machi/scenes/station/stationSigns.ts](../src/components/visualizer/machi/scenes/station/stationSigns.ts)
- [src/components/visualizer/machi/scenes/station/structures.ts](../src/components/visualizer/machi/scenes/station/structures.ts)
- [src/components/visualizer/machi/scenes/station/vehicles.ts](../src/components/visualizer/machi/scenes/station/vehicles.ts)
- [src/components/visualizer/machi/scenes/types.ts](../src/components/visualizer/machi/scenes/types.ts)
- [src/components/visualizer/machi/shownScene.ts](../src/components/visualizer/machi/shownScene.ts)
- [src/components/visualizer/machi/tuning.ts](../src/components/visualizer/machi/tuning.ts)
- [src/components/visualizer/machi/types.ts](../src/components/visualizer/machi/types.ts)
- [src/components/visualizer/nebbia/NebbiaSettingsPanel.tsx](../src/components/visualizer/nebbia/NebbiaSettingsPanel.tsx)
- [src/components/visualizer/nebbia/VisualizerNebbia.tsx](../src/components/visualizer/nebbia/VisualizerNebbia.tsx)
- [src/components/visualizer/nebbia/createNebbiaRuntime.ts](../src/components/visualizer/nebbia/createNebbiaRuntime.ts)
- [src/components/visualizer/nebbia/entry.tsx](../src/components/visualizer/nebbia/entry.tsx)
- [src/components/visualizer/nebbia/nebbiaBlocks.ts](../src/components/visualizer/nebbia/nebbiaBlocks.ts)
- [src/components/visualizer/nebbia/nebbiaBreath.ts](../src/components/visualizer/nebbia/nebbiaBreath.ts)
- [src/components/visualizer/nebbia/nebbiaChars.ts](../src/components/visualizer/nebbia/nebbiaChars.ts)
- [src/components/visualizer/nebbia/nebbiaCompositions.ts](../src/components/visualizer/nebbia/nebbiaCompositions.ts)
- [src/components/visualizer/nebbia/nebbiaConstants.ts](../src/components/visualizer/nebbia/nebbiaConstants.ts)
- [src/components/visualizer/nebbia/nebbiaCredits.ts](../src/components/visualizer/nebbia/nebbiaCredits.ts)
- [src/components/visualizer/nebbia/nebbiaDrizzleRide.ts](../src/components/visualizer/nebbia/nebbiaDrizzleRide.ts)
- [src/components/visualizer/nebbia/nebbiaDropSpring.ts](../src/components/visualizer/nebbia/nebbiaDropSpring.ts)
- [src/components/visualizer/nebbia/nebbiaDrops.ts](../src/components/visualizer/nebbia/nebbiaDrops.ts)
- [src/components/visualizer/nebbia/nebbiaDrumBumps.ts](../src/components/visualizer/nebbia/nebbiaDrumBumps.ts)
- [src/components/visualizer/nebbia/nebbiaFrameUniforms.ts](../src/components/visualizer/nebbia/nebbiaFrameUniforms.ts)
- [src/components/visualizer/nebbia/nebbiaGl.ts](../src/components/visualizer/nebbia/nebbiaGl.ts)
- [src/components/visualizer/nebbia/nebbiaGlUtils.ts](../src/components/visualizer/nebbia/nebbiaGlUtils.ts)
- [src/components/visualizer/nebbia/nebbiaGlyphs.ts](../src/components/visualizer/nebbia/nebbiaGlyphs.ts)
- [src/components/visualizer/nebbia/nebbiaHits.ts](../src/components/visualizer/nebbia/nebbiaHits.ts)
- [src/components/visualizer/nebbia/nebbiaInk.ts](../src/components/visualizer/nebbia/nebbiaInk.ts)
- [src/components/visualizer/nebbia/nebbiaLayout.ts](../src/components/visualizer/nebbia/nebbiaLayout.ts)
- [src/components/visualizer/nebbia/nebbiaMask.ts](../src/components/visualizer/nebbia/nebbiaMask.ts)
- [src/components/visualizer/nebbia/nebbiaPalette.ts](../src/components/visualizer/nebbia/nebbiaPalette.ts)
- [src/components/visualizer/nebbia/nebbiaRaindrop.LICENSE.txt](../src/components/visualizer/nebbia/nebbiaRaindrop.LICENSE.txt)
- [src/components/visualizer/nebbia/nebbiaRaindrop.png](../src/components/visualizer/nebbia/nebbiaRaindrop.png)
- [src/components/visualizer/nebbia/nebbiaScene.ts](../src/components/visualizer/nebbia/nebbiaScene.ts)
- [src/components/visualizer/nebbia/nebbiaSceneClock.ts](../src/components/visualizer/nebbia/nebbiaSceneClock.ts)
- [src/components/visualizer/nebbia/nebbiaSceneGlsl.ts](../src/components/visualizer/nebbia/nebbiaSceneGlsl.ts)
- [src/components/visualizer/nebbia/nebbiaShaders.ts](../src/components/visualizer/nebbia/nebbiaShaders.ts)
- [src/components/visualizer/nebbia/nebbiaSkeleton.ts](../src/components/visualizer/nebbia/nebbiaSkeleton.ts)
- [src/components/visualizer/nebbia/nebbiaSpot.ts](../src/components/visualizer/nebbia/nebbiaSpot.ts)
- [src/components/visualizer/nebbia/nebbiaStrokes.ts](../src/components/visualizer/nebbia/nebbiaStrokes.ts)
- [src/components/visualizer/nebbia/nebbiaWipe.ts](../src/components/visualizer/nebbia/nebbiaWipe.ts)
- [src/components/visualizer/nebbia/tuning.ts](../src/components/visualizer/nebbia/tuning.ts)
- [src/components/visualizer/nebbia/types.ts](../src/components/visualizer/nebbia/types.ts)
- [src/components/visualizer/partita/VisualizerPartita.tsx](../src/components/visualizer/partita/VisualizerPartita.tsx)
- [src/components/visualizer/runtime.ts](../src/components/visualizer/runtime.ts)
- [src/components/visualizer/sonnet/VisualizerSonnet.tsx](../src/components/visualizer/sonnet/VisualizerSonnet.tsx)
- [src/components/visualizer/tempera/VisualizerTempera.tsx](../src/components/visualizer/tempera/VisualizerTempera.tsx)
- [src/components/visualizer/tilt/VisualizerTilt.tsx](../src/components/visualizer/tilt/VisualizerTilt.tsx)
- [src/components/visualizer/useVisualizerRendererModel.ts](../src/components/visualizer/useVisualizerRendererModel.ts)
- [src/components/visualizer/window/SubtitleOverlayRowsSetting.tsx](../src/components/visualizer/window/SubtitleOverlayRowsSetting.tsx)
- [src/components/visualizer/window/VisPlayground.tsx](../src/components/visualizer/window/VisPlayground.tsx)
- [src/components/visualizer/window/VisPlaygroundSettingsPanel.tsx](../src/components/visualizer/window/VisPlaygroundSettingsPanel.tsx)
- [src/hooks/useBeatFxTrack.ts](../src/hooks/useBeatFxTrack.ts)
- [src/hooks/useObsBrowserSourcePublisher.ts](../src/hooks/useObsBrowserSourcePublisher.ts)
- [src/i18n/locales/en.ts](../src/i18n/locales/en.ts)
- [src/i18n/locales/in.ts](../src/i18n/locales/in.ts)
- [src/i18n/locales/vi.ts](../src/i18n/locales/vi.ts)
- [src/i18n/locales/zh-CN.ts](../src/i18n/locales/zh-CN.ts)
- [src/index.css](../src/index.css)
- [src/library/suites/bravais/BravaisStage.tsx](../src/library/suites/bravais/BravaisStage.tsx)
- [src/mods/folium/registries/visualizerRender.tsx](../src/mods/folium/registries/visualizerRender.tsx)
- [src/services/analysis/README.md](../src/services/analysis/README.md)
- [src/services/analysis/beatGridKeys.ts](../src/services/analysis/beatGridKeys.ts)
- [src/services/analysis/drumHitPicking.ts](../src/services/analysis/drumHitPicking.ts)
- [src/services/analysis/drumHits.ts](../src/services/analysis/drumHits.ts)
- [src/services/analysis/drumStem.ts](../src/services/analysis/drumStem.ts)
- [src/services/analysis/stemPass.ts](../src/services/analysis/stemPass.ts)
- [src/services/analysis/stemRange.ts](../src/services/analysis/stemRange.ts)
- [src/services/analysis/trackStemRun.ts](../src/services/analysis/trackStemRun.ts)
- [src/services/analysis/vocalEnvelope.ts](../src/services/analysis/vocalEnvelope.ts)
- [src/services/analysis/vocalStemRun.ts](../src/services/analysis/vocalStemRun.ts)
- [src/services/analysis/vocalStream.ts](../src/services/analysis/vocalStream.ts)
- [src/services/audioOutputSink.ts](../src/services/audioOutputSink.ts)
- [src/services/beatFx/beatEffects.ts](../src/services/beatFx/beatEffects.ts)
- [src/services/beatFx/beatFxLive.ts](../src/services/beatFx/beatFxLive.ts)
- [src/services/beatFx/beatFxSource.ts](../src/services/beatFx/beatFxSource.ts)
- [src/services/beatFx/externalAudioReactivity.ts](../src/services/beatFx/externalAudioReactivity.ts)
- [src/services/beatFx/smartBeatSettings.ts](../src/services/beatFx/smartBeatSettings.ts)
- [src/services/obs/visualSettingsConfig.ts](../src/services/obs/visualSettingsConfig.ts)
- [src/services/onlineMusic/README.md](../src/services/onlineMusic/README.md)
- [src/services/onlineMusic/omni.ts](../src/services/onlineMusic/omni.ts)
- [src/services/onlineMusic/qishui/qishuiPlayback.ts](../src/services/onlineMusic/qishui/qishuiPlayback.ts)
- [src/services/repositories/cacheRepository.ts](../src/services/repositories/cacheRepository.ts)
- [src/services/repositories/cacheUsage.ts](../src/services/repositories/cacheUsage.ts)
- [src/services/sync/settingsSnapshot.ts](../src/services/sync/settingsSnapshot.ts)
- [src/services/sync/syncSchema.ts](../src/services/sync/syncSchema.ts)
- [src/services/sync/syncTypes.ts](../src/services/sync/syncTypes.ts)
- [src/stores/useLibraryWallLookStore.ts](../src/stores/useLibraryWallLookStore.ts)
- [src/stores/useTypographySettingsStore.ts](../src/stores/useTypographySettingsStore.ts)
- [src/types.ts](../src/types.ts)
- [src/types/obsBrowserSource.ts](../src/types/obsBrowserSource.ts)
- [src/types/onlineMusic.ts](../src/types/onlineMusic.ts)
- [src/types/remoteControl.ts](../src/types/remoteControl.ts)
- [src/types/visualizerModes.ts](../src/types/visualizerModes.ts)
- [src/utils/appearanceCodec.ts](../src/utils/appearanceCodec.ts)
- [src/utils/appearanceImportPlan.ts](../src/utils/appearanceImportPlan.ts)
- [src/utils/libraryWallSeamDirection.ts](../src/utils/libraryWallSeamDirection.ts)
- [src/utils/lyrics/subtitleOverlayLayout.ts](../src/utils/lyrics/subtitleOverlayLayout.ts)
- [src/utils/obsWebAppearance.ts](../src/utils/obsWebAppearance.ts)
- [src/vite-env.d.ts](../src/vite-env.d.ts)
- [test/component/loginPlatformColumn.spec.ts](../test/component/loginPlatformColumn.spec.ts)
- [test/component/subtitleDualRow.spec.ts](../test/component/subtitleDualRow.spec.ts)
- [test/component/subtitleOverlayRows.spec.ts](../test/component/subtitleOverlayRows.spec.ts)
- [test/unit/analysis/drumHits.test.ts](../test/unit/analysis/drumHits.test.ts)
- [test/unit/analysis/stemPass.test.ts](../test/unit/analysis/stemPass.test.ts)
- [test/unit/analysis/stemRange.test.ts](../test/unit/analysis/stemRange.test.ts)
- [test/unit/analysis/trackStemRun.test.ts](../test/unit/analysis/trackStemRun.test.ts)
- [test/unit/analysis/vocalEnvelope.test.ts](../test/unit/analysis/vocalEnvelope.test.ts)
- [test/unit/analysis/vocalStemRun.test.ts](../test/unit/analysis/vocalStemRun.test.ts)
- [test/unit/analysis/vocalStream.test.ts](../test/unit/analysis/vocalStream.test.ts)
- [test/unit/command-palette/__snapshots__/commandRegistryContract.test.ts.snap](../test/unit/command-palette/__snapshots__/commandRegistryContract.test.ts.snap)
- [test/unit/command-palette/libraryWallLookCommands.test.ts](../test/unit/command-palette/libraryWallLookCommands.test.ts)
- [test/unit/lyrics/subtitleOverlayLayout.test.ts](../test/unit/lyrics/subtitleOverlayLayout.test.ts)
- [test/unit/obs/obsWebAppearance.test.ts](../test/unit/obs/obsWebAppearance.test.ts)
- [test/unit/playback/previewNotice.test.ts](../test/unit/playback/previewNotice.test.ts)
- [test/unit/remote/remoteQueueFeed.test.ts](../test/unit/remote/remoteQueueFeed.test.ts)
- [test/unit/remote/remoteQueueSearch.test.ts](../test/unit/remote/remoteQueueSearch.test.ts)
- [test/unit/remote/remoteWindowGeometry.test.ts](../test/unit/remote/remoteWindowGeometry.test.ts)
- [test/unit/services/audioOutputSink.test.ts](../test/unit/services/audioOutputSink.test.ts)
- [test/unit/spotify/soloistRemoteQueue.test.ts](../test/unit/spotify/soloistRemoteQueue.test.ts)
- [test/unit/stores/__snapshots__/configSurfaceContract.test.ts.snap](../test/unit/stores/__snapshots__/configSurfaceContract.test.ts.snap)
- [test/unit/stores/__snapshots__/storeContract.test.ts.snap](../test/unit/stores/__snapshots__/storeContract.test.ts.snap)
- [test/unit/sync/syncSchema.test.ts](../test/unit/sync/syncSchema.test.ts)
- [test/unit/utils/libraryWallSeamDirection.test.ts](../test/unit/utils/libraryWallSeamDirection.test.ts)
- [test/unit/visualizer/__snapshots__/storedSettingsPins.test.ts.snap](../test/unit/visualizer/__snapshots__/storedSettingsPins.test.ts.snap)
- [test/unit/visualizer/externalAudioReactivity.test.ts](../test/unit/visualizer/externalAudioReactivity.test.ts)
- [test/unit/visualizer/machi/beatFx.test.ts](../test/unit/visualizer/machi/beatFx.test.ts)
- [test/unit/visualizer/machi/boardLayout.test.ts](../test/unit/visualizer/machi/boardLayout.test.ts)
- [test/unit/visualizer/machi/camera.test.ts](../test/unit/visualizer/machi/camera.test.ts)
- [test/unit/visualizer/machi/director.test.ts](../test/unit/visualizer/machi/director.test.ts)
- [test/unit/visualizer/machi/environment.test.ts](../test/unit/visualizer/machi/environment.test.ts)
- [test/unit/visualizer/machi/kowloon.test.ts](../test/unit/visualizer/machi/kowloon.test.ts)
- [test/unit/visualizer/machi/lens.test.ts](../test/unit/visualizer/machi/lens.test.ts)
- [test/unit/visualizer/machi/machiQuality.test.ts](../test/unit/visualizer/machi/machiQuality.test.ts)
- [test/unit/visualizer/machi/machiTuning.test.ts](../test/unit/visualizer/machi/machiTuning.test.ts)
- [test/unit/visualizer/machi/palette.test.ts](../test/unit/visualizer/machi/palette.test.ts)
- [test/unit/visualizer/machi/schedules.test.ts](../test/unit/visualizer/machi/schedules.test.ts)
- [test/unit/visualizer/machi/station.test.ts](../test/unit/visualizer/machi/station.test.ts)
- [test/unit/visualizer/nebbiaDrops.test.ts](../test/unit/visualizer/nebbiaDrops.test.ts)
- [test/unit/visualizer/nebbiaDrumBumps.test.ts](../test/unit/visualizer/nebbiaDrumBumps.test.ts)
- [test/unit/visualizer/nebbiaHits.test.ts](../test/unit/visualizer/nebbiaHits.test.ts)
- [test/unit/visualizer/nebbiaStrokesPlugin.test.ts](../test/unit/visualizer/nebbiaStrokesPlugin.test.ts)
- [test/unit/visualizer/registry.test.ts](../test/unit/visualizer/registry.test.ts)
- [test/unit/visualizer/smartBeat.test.ts](../test/unit/visualizer/smartBeat.test.ts)
- [test/unit/visualizer/storedSettingsPins.test.ts](../test/unit/visualizer/storedSettingsPins.test.ts)
- [test/unit/visualizer/subtitleOverlay.test.ts](../test/unit/visualizer/subtitleOverlay.test.ts)
- [test/unit/visualizer/tuningBundleTransport.test.ts](../test/unit/visualizer/tuningBundleTransport.test.ts)
- [test/unit/visualizer/visualSettingsImportExport.test.ts](../test/unit/visualizer/visualSettingsImportExport.test.ts)
- [vite.config.ts](../vite.config.ts)
