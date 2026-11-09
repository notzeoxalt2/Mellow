# Mellow desktop QA and storage routine

This is the repeatable, low-risk check for the Windows desktop shell. It uses
the running web app in a browser for route and interaction checks, then the
repo's automated checks. It does not require account sign-in or playback.

## Before a release

From `web/`:

1. Run `pnpm dev` and open `http://localhost:5173` in the Codex browser.
2. Check Home, Search, New, Settings, Themes, Extension, Library, and a playlist
   route. Confirm each route renders a heading and its main content, and that
   the sidebar and page scroll areas remain usable at a narrow and wide window.
3. Check navigation from the sidebar, search field focus/clear, opening and
   closing the now-playing panel, and full-screen player close/expand controls.
   Do not start playback as a smoke-check; integration playback needs a signed-in
   provider and should be verified separately with the user's own session.
4. Inspect the browser console for uncaught errors and failed local app assets.
   Treat provider/network errors separately from app runtime errors.
5. Run `pnpm test`, `pnpm typecheck`, and `pnpm --filter @bitchord/app build`.

## Packaged Windows UI smoke

To open a packaged candidate without sharing the everyday desktop profile, run
this from the `web/` folder. A distinct profile is required for every concurrent
test session:

```powershell
./scripts/launch-qa-candidate.ps1 `
  -ExePath ./release/Mellow-win32-x64-<candidate>/Mellow.exe `
  -ProfilePath "$env:LOCALAPPDATA/Temp/Mellow-QA-Isolated-<candidate>" `
  -RemoteDebuggingPort 9437
pnpm desktop:smoke -- 9437
```

The helper launches the app with a separate profile and enables DevTools on
loopback only when a port is supplied. The smoke runner drives real in-app
navigation over that local debug connection and checks Home, Search, New,
Settings, Themes, Playlist Sync, and Extension content, uncaught renderer
exceptions, and failed local assets. It also opens/closes the ephemeral
Now Playing panel and checks page/sidebar scroll behavior. It briefly toggles
“Play music videos,” confirms the switch responds, then restores its original
value in the isolated QA profile. It does not sign in, start playback, or touch the
  normal profile. Keep provider-connected testing in a deliberately configured
  test profile; never copy the everyday profile to make a test launch work. The
  runner does not close the QA app; close it after visual inspection. Keep its
  isolated profile unless its saved test state is no longer needed.

For manual visual verification, inspect the uniquely identified QA window with
the Codex desktop computer-use surface. Do not interact with the everyday Mellow
window during packaged QA.

## Safe storage inventory

Run `pnpm storage:audit` for a read-only inventory of full Windows release
snapshots and Electron's disposable cache directories. This default compares
executable sizes only, so those are candidates rather than confirmed duplicates.
Use `pnpm storage:audit -- --verify-executables` to stream and SHA-256 every
packaged executable for exact duplicate verification; this may read many
gigabytes and should be run occasionally. Add `-- --json` for a machine-readable
report. `MELLOW_RELEASE_DIR` and `MELLOW_USER_DATA_DIR` can point the audit at a
different location.

The generated `release/` directory is git-ignored so local installer snapshots
do not enter source changes by accident. Ignore rules do not delete those
snapshots or recover disk space; review the read-only inventory before choosing
which versions to retain.

The audit never removes files. It totals package payloads, compares executable
sizes by default, and totals explicitly named Chromium caches. Exact executable
hashing is opt-in and memory-bounded. It does not follow symbolic links or
traverse sign-in data, preferences, localStorage,
IndexedDB, or playback state. Keep release snapshots until a human chooses a
retention policy; clearing caches or pruning snapshots is deliberately not part
of this command.

## Integration checks

When signed-in Spotify/YouTube Music accounts are available, separately check
that each provider's connection status is accurate, library and playlist data
load, play/pause/next/previous and volume are reflected in the selected provider,
and favorite actions affect the intended service. Check Spotify Canvas only on
tracks that actually have Canvas media and where the account/provider exposes
it. Do not report a provider outage or unavailable catalog item as a local UI
test failure without confirming it in that provider's own web app.

## One-command isolated desktop run

Run `pnpm desktop:qa` to auto-select the newest packaged Windows candidate in
`release/`, wait for its loopback-only DevTools endpoint, run the interaction
smoke, and close only the process tree launched by that command. To pin a
specific candidate or choose another disposable profile, invoke the PowerShell
script directly:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-desktop-qa.ps1 `
  -ExePath .\release\Mellow-win32-x64-<candidate>\Mellow.exe `
  -ProfilePath "$env:LOCALAPPDATA\Temp\Mellow-QA-<candidate>"
```

It reuses `%LOCALAPPDATA%\Temp\Mellow-QA-Automated` by default. It refuses to
start if that QA profile is already in use, rejects any profile path that
overlaps the normal `%APPDATA%\mellow-desktop` profile, checks that the launched
process tree exits, and never deletes its isolated profile.

The smoke report lists individual route/interaction checks and asserts zero
renderer exceptions and zero failed local assets. Account, playback, and
provider mutations remain outside this signed-out smoke; test those only with
a deliberately isolated provider account.

Storage inventory remains read-only: `pnpm storage:audit -- --json` inventories
package payload sizes and explicitly disposable Chromium caches. The optional
`--verify-executables` hashes package executables but does not prove that the
rest of those package folders match. No cleanup action is automated. Keep
release-retention decisions manual until full package contents have been
verified and a retention policy is explicit.

## Latest packaged interaction run — 2026-11-03

- Candidate: `release/Mellow-win32-x64-yt-channel-reset-2026-11-03/Mellow.exe`.
  Launched on loopback CDP port 9451 with isolated profile
  `%LOCALAPPDATA%\Temp\Mellow-QA-Settings-Roundtrip-2026-11-03`; the normal
  Mellow profile was not opened.
- All 18 route and interaction checks passed: Home, Search, Apple/Spotify/
  YouTube category switching, 189 Apple tiles, 46 YouTube Music tiles, New,
  Settings, Themes, Playlist Sync, Extension, both scroll containers, and Now
  Playing open/close. The “Play music videos” toggle changed and returned to
  its initial off state. Renderer exceptions: 0; failed local assets: 0.
- Spotify categories showed the explicit signed-out/unavailable state. This
  packaged run did not sign in or verify account-backed provider behavior.
- The smoke runner now validates this settings interaction as part of the
  reusable QA system. The app's appearance settings were left at their
  original values.
- Read-only storage audit: 71 release snapshots / 29,704.9 MiB; 70 same-sized
  234.9 MiB executable candidates. Exact SHA-256 verification confirmed those
  70 `Mellow.exe` files are byte-identical; one package has a different host
  executable. This does not prove the complete package folders are duplicates:
  app resources differ slightly and must be compared separately before any
  retention decision. Named Chromium caches total 106.9 MiB. No releases,
  caches, account data, or app preferences were removed.
- Idle resource sample across the five QA app processes after navigation:
  541.4 MiB aggregate working set, 314 MiB private memory, and 0.062 CPU
  seconds accumulated over a 10-second interval. This is a single signed-out
  idle sample; gameplay, video, and account-connected usage need separate
  measurements before calling runtime optimization accepted.

## Latest local preview run — 2026-11-03

- Opened the Vite preview at `http://localhost:5173` in the Codex browser.
- Home, Search, New, Settings, and Extension routes rendered; Settings exposed the appearance/glow controls and playback options. Search's category catalog loaded. Switching the category source to Spotify changed the selected tab and showed the explicit unavailable message. This browser has no extension or linked Spotify session.
- Submitted `C-Pop playlist` in Search. It returned the empty state because no provider integration was available in this preview; this does not verify signed-in search.
- Browser console error and warning logs were empty. No playback, sign-in, preferences, or stored data were changed.
- Re-ran `pnpm storage:audit`: 68 release snapshots (28,449.4 MiB), 67 same-sized 234.9 MiB executables (size candidates only), and 106.7 MiB in named disposable caches. The audit was read-only. No cache or release data was deleted.
- Desktop packaged runtime, provider-connected search/library/playback, Canvas, and live memory/CPU remain separate acceptance checks; the browser preview cannot validate them.

## 2026-11-03 YouTube retry recovery and broader build verification

- Added a focused YouTube session gate so an explicit “Try Again” clears the rejected-session cache and probes the live account endpoints. Ordinary auth reads remain rejected until an explicit refresh or account-cookie invalidation; healthy sessions are not reset. The error state also offers the existing “Open YouTube Music account” sign-in action.
- Focused auth regression test passed: `pnpm --filter @bitchord/app exec vitest run src/extension/ytAuth.test.ts --pool=threads --maxWorkers=1` (1 file, 2 tests). App typecheck and extension typecheck passed. Full app test command passed (17 files, 160 tests). App production build and Chrome/Firefox extension production builds passed; known Essentia externalization/CommonJS and large-chunk warnings remain.
- Reused the local Vite preview in the Codex browser. Home, Settings, and Search rendered; Settings showed the service/appearance controls and Search showed the illustrated Apple category catalog. No extension or signed-in provider account was attached, so YouTube and Spotify account-backed flows were not verified. No playback or settings were changed.
- Re-ran the read-only storage audit: 68 release snapshots total 29,831,406,498 bytes (about 27.8 GiB); 67 packaged executables have the same size, which is only a candidate signal, not proof of duplicate packages; explicitly named Chromium caches total about 106.7 MiB. No files were deleted. Auth, preferences, localStorage, IndexedDB, and playback state remain outside the audit.
- `git diff --check` passed; line-ending conversion notices are informational. Packaged Windows runtime, live signed-in YouTube recovery/library/search/playback, Spotify live state/Canvas, and runtime resource measurements remain open acceptance checks.

## 2026-11-03 Packaged candidate UI and storage check

- Launched `release/Mellow-win32-x64-ambient-customization-2026-11-03/Mellow.exe`
  with a separate profile under `%LOCALAPPDATA%\Temp\mellow-qa-isolated-2026-11-03`.
  The normal `Roaming\mellow-desktop` profile and its currently playing Spotify
  session were not opened or modified.
- Exercised `scripts/launch-qa-candidate.ps1` against the same candidate and
  profile; it opened Home, reported the isolated profile path, and the QA window
  was closed afterward. The script's PowerShell parser check passed.
- Packaged Settings rendered and showed the signed-out status correctly for
  both providers. Search opened; the Apple Music category catalog rendered its
  illustrated genre tiles; switching to Spotify showed the expected
  unavailable-feed explanation for a signed-out test profile. Switching to
  YouTube Music showed its mood and genre catalog, and opening “Chill” navigated
  to populated YouTube Music Browse shelves with playlist artwork. No sign-in,
  playback, or settings were changed.
- After the catalog loaded, a 10-second idle UI sample across the main, GPU,
  network-service, and renderer processes totaled about 483 MiB working set and
  5.8% CPU normalized across 12 logical processors. No media was playing, so
  this is a UI-idle observation, not an audio/video playback benchmark.
- Read-only package audit: 68 release snapshots use 27.78 GiB; named Chromium
  caches use about 106.9 MiB. Hashing confirmed the packaged `Mellow.exe` is
  identical in 67 snapshots, but this does not mean the full packages are
  duplicates (each also contains app assets and resources). No releases or
  caches were removed. Protected account, preferences, IndexedDB, and playback
  data were not traversed by the audit.
- Remaining acceptance gap: real signed-in YouTube Music and Spotify accounts
  are not present in the isolated test profile, so account library/search,
  playback handoff, favorites, synchronization, and Canvas remain unverified.

## 2026-11-03 Isolated packaged route smoke and storage recheck

- Extended `scripts/launch-qa-candidate.ps1` with an optional loopback-only
  DevTools port, preserving the isolated-profile guard.
- Added `scripts/desktop-smoke.mjs` and `pnpm desktop:smoke`. It navigates the
  packaged app through its actual links and checks Home, Search, New, and
  Settings content, uncaught renderer exceptions, and failed local assets.
- Ran candidate `release/Mellow-win32-x64-ambient-customization-2026-11-03/Mellow.exe`
  on port 9437 with a fresh profile at
  `%LOCALAPPDATA%\Temp\Mellow-QA-Isolated-2026-11-03-cdp`. All four routes
  passed; renderer exceptions and failed local assets were both zero. A native
  window capture confirmed the isolated candidate rendered Settings. It was
  signed out; no playback or settings were changed. The candidate was closed
  after visual inspection, with its isolated profile retained; the user's r68
  session was not changed.
- Read-only storage audit: 68 release snapshots total 28,449.4 MiB; 67
  same-sized 234.9 MiB executables remain candidates only; named caches total
  106.9 MiB. Nothing was removed. The user-data store's auth, preferences,
  localStorage, IndexedDB, and playback state were not traversed.
- Remaining gap: provider-authenticated YouTube/Spotify library and playback
  checks still need a deliberately signed-in QA account. No ZIP or webhook send.

## 2026-11-03 YouTube session bridge and packaged extension-path regression

- Changed YouTube cookie merging so the current origin-scoped Chrome snapshot
  takes precedence over stale values in Mellow's embedded cookie jar. Added
  unit coverage for authoritative cookie precedence and host separation.
- Centralized extension-to-desktop account synchronization for the background
  worker and popup. It includes both YouTube origins and returns transport
  success/failure without logging cookie values.
- Packaged candidate `release/Mellow-win32-x64-yt-cookie-qa-2026-11-03/Mellow.exe`
  with a dedicated profile at `%LOCALAPPDATA%\Temp\Mellow-QA-YTCookie-2026-11-03`
  and loopback CDP port 9438. The first route smoke found `/downloads/extension.json`
  resolving from the drive root under `file://`; changed extension resources to
  resolve relative to the app page and added website/file URL regression tests.
- Rebuilt and reran the candidate smoke: Home, Search, New, and Settings passed;
  renderer exceptions: 0; failed local assets: 0. Normal r68 processes and the
  normal user-data profile were not used by the QA run.
- Verification: workspace tests passed (19 files, 165 tests); workspace
  typecheck passed; Chrome and Firefox extension production builds passed;
  packaged desktop build passed; `git diff --check` passed (line-ending notices
  only). The app build still reports the existing large media/analysis chunks.
- Storage audit remains read-only after creating the QA candidate: 69 release
  snapshots, 28,867.9 MiB total; 106.9 MiB in named disposable caches. No
  package, cache, account, settings,
  localStorage, IndexedDB, or playback data was removed or modified by the audit.
- Live provider integration is still unverified in this isolated profile. The
  cookie merge is covered by tests, but account library/search/playback and
  Spotify/YouTube history/favorite synchronization still require a signed-in
  QA account. No ZIP was created and nothing was sent to a webhook.

## 2026-11-03 Packaged interaction and storage recheck

- Expanded `scripts/desktop-smoke.mjs` to check all seven core page routes,
  Settings entry links to Themes, Playlist Sync, and Extension, both scroll
  containers, and opening/closing the Now Playing panel. It leaves settings,
  account data, playback, and queues untouched.
- Ran packaged `Mellow-win32-x64-yt-cookie-qa-2026-11-03/Mellow.exe` with the
  isolated profile `%LOCALAPPDATA%\Temp\Mellow-QA-Interaction-2026-11-03`
  and loopback DevTools port 9440. All 13 route/interaction checks passed;
  renderer exceptions: 0; failed local assets: 0. No playback or preferences
  were changed, and the everyday Mellow profile was not opened by this run.
- Read-only storage recheck: 69 release snapshots total 28,867.9 MiB; 68
  same-sized 234.9 MiB executable candidates; explicitly named disposable
  Chromium caches total 106.9 MiB. Same-sized executables are not proof that
  complete release folders are duplicates. No package or cache was deleted;
  auth, settings, localStorage, IndexedDB, and playback data were not read.
- Live provider-authenticated account flows and playback remain separate
  acceptance checks; this smoke intentionally avoids those side effects.

## 2026-11-03 Repeatable interaction smoke

- Reused the signed-out packaged candidate with an isolated profile and
  loopback DevTools port 9442. The smoke initially exposed a state assumption:
  a prior failed run had left Now Playing open, and the next toggle closed it.
  Updated the runner to normalize the panel to closed first and wait for the
  actual rendered open state. Re-run passed all 13 route/interaction checks;
  renderer exceptions: 0; failed local assets: 0.
- App suite passed: 19 files, 165 tests. `git diff --check` passed; Git printed
  only existing LF-to-CRLF informational notices.
- Re-ran the read-only storage audit: 69 release snapshots total 28,867.9 MiB;
  68 same-sized 234.9 MiB executables remain size-only candidates; named
  disposable Chromium caches total 106.9 MiB. No release, cache, or user data
  was removed. The isolated QA profile created for this run is about 21 MiB;
  its window was closed, but the environment blocked cleanup of that temp
  profile, so it remains available for repeat testing.
- The everyday r68 session was not touched. Account-connected YouTube/Spotify
  workflows and playback quality remain unverified in this signed-out smoke.

## 2026-11-03 Bounded YouTube account probe and packaged interaction run

- Changed the browser bridge account scan to probe the active YouTube Music
  login index first and limit concurrent Google account probes to two. This
  avoids the previous burst of up to ten simultaneous account-menu requests
  (and a second channel request for each valid login) during reconnect.
- Added focused tests for the bounded pool's concurrency ceiling, stable result
  order, and invalid concurrency values. All four auth-focused tests passed.
- Verification: the full app suite passed (19 files, 167 tests); app and
  extension TypeScript checks passed; production app, Chrome extension, and
  Firefox extension builds passed; desktop packaging passed. The packaged
  extension contains 15 files and every SHA-256 matches the extension build
  output.
- Ran `desktop:smoke` against the packaged candidate
  `release/Mellow-win32-x64-auth-scan-2026-11-03/Mellow.exe`, using loopback
  DevTools port 9443 and isolated profile
  `%LOCALAPPDATA%\Temp\Mellow-QA-AuthScan-2026-11-03`. All 13 route,
  interaction, sidebar/page scroll, and Now Playing panel checks passed;
  renderer exceptions: 0; failed local assets: 0. The candidate window was
  closed, and the isolated profile was retained for repeat verification.
- The isolated profile was signed out, so real YouTube/Spotify login, library
  sync, favorites, Canvas, and playback handoff remain unverified. The normal
  r68 profile and its playback/settings data were not touched.
- Read-only storage audit: 70 release snapshots total 29,286.4 MiB; 69
  same-sized 234.9 MiB executable candidates (size alone does not establish
  duplicate packages); named Chromium caches total 106.9 MiB. No releases or
  caches were deleted, and protected auth/preferences/IndexedDB/playback data
  were not traversed. No ZIP was created or sent.

## 2026-11-03 YouTube channel reset on account change

- Fixed YouTube desktop reconnect state: when the saved session cookie or login
  index changes, the app now clears the cached channel page ID and active
  channel before refreshing account data. This prevents a newly authenticated
  account from reusing the previous account's channel identity.
- Added focused regression tests. All 3 passed; the full suite passed (20 files,
  170 tests). Workspace typecheck, desktop build, app build, Chrome/Firefox
  extension builds, desktop packaging, and `git diff --check` passed. Existing
  app-build warnings about Essentia.js externals/CommonJS and large chunks
  remain.
- Packaged candidate:
  `release/Mellow-win32-x64-yt-channel-reset-2026-11-03/Mellow.exe`. Ran the
  13-check packaged interaction smoke on loopback port 9444 with isolated
  profile `%LOCALAPPDATA%\Temp\Mellow-QA-YTChannelReset-2026-11-03`: all route,
  scroll, Settings-link, and Now Playing open/close checks passed; renderer
  exceptions: 0; failed local assets: 0. The candidate was closed; its QA
  profile is retained for repeat runs.
- This was a signed-out app smoke. Live YouTube/Spotify authentication,
  provider library/search/playback, Canvas, and cross-service sync remain
  unverified. Do not call the reconnect fix live-account verified until tested
  with a deliberately isolated signed-in QA session.
- Latest read-only storage audit: 71 release snapshots / 29,704.9 MiB; 70
  same-sized 234.9 MiB executables are candidates only; named disposable caches
  total 106.9 MiB. No release, cache, or user data was deleted or read beyond
  the audit's safe inventory. Keep protected account/auth, preferences,
  localStorage, IndexedDB, and playback state untouched. No ZIP/webhook action.

## 2026-11-03 Expanded catalog interaction smoke and storage recheck

- Expanded `scripts/desktop-smoke.mjs` so the packaged app check now switches
  across Apple Music, Spotify, and YouTube Music category tabs, verifies the
  Apple editorial catalog has at least 150 tiles, opens Acoustic into search,
  and distinguishes provider-unavailable states from an empty category UI.
- Ran `Mellow-win32-x64-yt-channel-reset-2026-11-03/Mellow.exe` on loopback
  port 9448 with isolated profile
  `%LOCALAPPDATA%\Temp\Mellow-QA-CategorySmoke-2026-11-03`. All 17 route and
  interaction checks passed: 189 Apple tiles, 46 YouTube Music tiles, explicit
  Spotify unavailable state in the signed-out profile, all main routes,
  scroll containers, and Now Playing open/close. Renderer exceptions: 0;
  failed local assets: 0. The QA candidate was closed after the run; its
  isolated test profile remains available for repeat runs.
- Full workspace test run passed (20 app test files, 170 tests). `node --check`
  passed for the smoke runner; `git diff --check` passed with Git's usual
  line-ending notices.
- Read-only storage audit: 71 release snapshots (~29.0 GiB / 31.1 GB); 70
  identical-size executable candidates, which are not proof that package
  folders are duplicates; named Chromium caches total about 106.9 MiB. No
  packages, caches, or user data were deleted or traversed beyond the safe
  inventory. Keep account, settings, localStorage, IndexedDB, and playback
  stores protected. Provider-connected Spotify/YouTube behavior was not tested
  because the QA profile is signed out.
