# Mellow — Comprehensive ChatGPT Handover & Project State

> **Instructions for ChatGPT / Next LLM**: You are continuing development on **Mellow** (formerly BitChord), an ultra-high-fidelity, aesthetic music player for Windows and Android. Mellow combines Apple Music's fluid design aesthetics, Spotify catalog/curator discovery, YouTube Music audio/video streaming, and native offline high-bitrate downloads. Below is the complete current state of the project, architecture, resolved issues, file locations, build commands, and a dedicated section on **Thumbnails & Artwork** for your upcoming work.

---

## 1. Project Overview & Environment

- **Repository Root**: `E:\AntiGravity\BitChord`
- **Web App / Desktop Directory**: `E:\AntiGravity\BitChord\web`
- **Android Directory**: `E:\AntiGravity\BitChord\app`
- **Git Branch & Remote**: `main` tracked against `https://github.com/notzeoxalt2/Mellow.git` (`mellow/main`). Latest commit: `75264dfa`.
- **Primary Tech Stack**:
  - **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Zustand (`player.ts`, `video.ts`, `ui.ts`), TanStack Query, Lucide icons, Shaka Player, InnerTube (`youtubei.js`).
  - **Desktop Core**: Electron 44, custom Node.js IPC bridges, native Discord RPC (`discordRpc.ts`), Windows Thumbar, offline storage engine (`downloads.ts`), Pathfinder Spotify GraphQL client.
  - **Mobile (Android)**: Kotlin, Jetpack Compose, Material 3, AndroidX Media3, ExoPlayer.
  - **Package Manager**: `pnpm` (run via `cmd /c "cd /d E:\AntiGravity\BitChord\web && npx --yes pnpm ..."`)

### Key Project Constraints & Rules:
1. **Drive Restrictions**: All project data, caches, Gradle builds, SDKs MUST remain strictly on drive `E:` (`E:\AntiGravity\.gradle`, `E:\CodexData\AndroidTools\sdk`). Never write heavy builds or caches to `C:`.
2. **Zero-Oval Geometry Rule**: Cards, buttons, and dialogs use squircle geometry (`rounded-[8px]` to `rounded-[12px]`). Only the floating player capsule uses `--radius-pill` (`1000px`).
3. **Frameless Player Controls**: The controls in `FullScreenPlayer.tsx` (top-right and bottom-right) MUST be bare, frameless icon glyphs without backgrounds, boxes, or borders.
4. **0ms Instant Track Skipping**: When the user skips or selects a song, cut outgoing audio immediately to 0 volume, cancel any automix/crossfade transitions, and swap decks with 0.0s latency.
5. **Git Remote**: The git remote is `mellow` (`https://github.com/notzeoxalt2/Mellow.git`), NOT `origin`.

---

## 2. Packaged Release Outputs & Executables

- **Desktop Release (Primary Staged)**: `E:\AntiGravity\BitChord\web\release\Mellow-win32-x64\Mellow.exe`
- **Installed App Location**: `C:\Users\NotZeox\AppData\Local\Programs\Mellow\resources\app\dist`
  *(Note: Whenever rebuilding frontend or desktop, copy `web/app/dist/*` and `web/desktop/dist/*` into this directory to keep the user's running app updated without reinstalling).*
- **Android APK Outputs (Freshly Assembled)**:
  - Universal (All Phones/Emulators): `E:\AntiGravity\BitChord\release\android\Mellow.apk` (250 MB)
  - 64-bit ARM Phones: `E:\AntiGravity\BitChord\release\android\Mellow-arm64-v8a-Debug.apk` (144 MB)

---

## 3. Latest Resolved Issues & Architectural Fixes (Commit `75264dfa`)

### A. Android App Rebranding & PC Quick Sync Code
- Replaced all legacy "BitChord" branding with "Mellow" across `app/build.gradle.kts`, `app/src/main/res/values/strings.xml`, and 19 localized `values-*/strings.xml` resource files.
- **PC Account Sync**:
  - Desktop: `web/desktop/src/main.ts` hosts a lightweight LAN HTTP server (`GET /pair/probe`, `POST /pair/claim`, `get-pairing-code` IPC). Generates a 6-digit sync code with 10-minute expiry.
  - Desktop UI: `LinkMobileModal.tsx` opened via `AccountButton.tsx` ("Link Mobile App").
  - Mobile: `app/src/main/java/com/music/bitchord/sync/PcSyncManager.kt` auto-discovers desktop on LAN via subnet ping probe on port `48125` and claims tokens.
  - Mobile UI: Added `LinkPcDialog.kt` to `OnboardingScreen.kt` and `AccountAndScrobblingScreen.kt`.
  - Fixed Kotlin compile errors: resolved duplicate `ALERT_*` constant conflicts and imported `androidx.compose.material.icons.Icons` for `Icons.Rounded.Devices`.
  - Built with Gradle `:app:assembleDevDebug` and published to `release/android/Mellow.apk`.

### B. Search Bar Hover Cursor Deadzone Fixed
- **Root Cause**: Electron's frameless window drag overlay (`.mellow-window-chrome` / `.mellow-window-drag` in `global.css`) has `position: fixed; inset: 0 140px 0 0; height: 38px; z-index: var(--z-web-chrome)` (`9901`). Because the search bar header was positioned at the top of the viewport with a lower z-index (`~15`), the upper 38px of the search input was covered by the invisible window-drag hit-test layer! Hovering the top of the search input triggered window dragging instead of text cursor (`cursor: text`), making the search bar appear intermittently unresponsive.
- **Fix**:
  1. `web/app/src/styles/global.css`: Raised `.mellow-search-header` to `z-index: calc(var(--z-web-chrome) + 2) !important;` with `pointer-events: none`. Its children have `pointer-events: auto !important; -webkit-app-region: no-drag !important;`.
  2. `web/app/src/components/music/SearchField.tsx`: Added explicit `style={{ WebkitAppRegion: 'no-drag' }}` and `cursor-text select-text` to `<form>` and `<input>`. Empty areas around the search bar still pass through to window dragging.

### C. Search Results Premature Empty State Fixed
- **Root Cause**: In `web/app/src/pages/SearchPage.tsx`, the loading check was:
  `if (search.isLoading && spotifySearch.isLoading && youtubeSongs.isLoading && spotifyCategory.isLoading) return <ResultsSkeleton />;`
  Because `spotifyCategory` is disabled when `categoryId` is null, it was never loading, causing the condition to evaluate to `false` on frame 1. The code immediately hit `if (!hasAny) return <EmptyState title="No Results" ... />`, flashing "No Results" before YouTube Music or Spotify network queries could return!
- **Fix**: Updated condition to:
  `const isSearchLoading = search.isLoading || youtubeSongs.isLoading || spotifySearch.isLoading || spotifyAll.isLoading || (!!categoryId && spotifyCategory.isLoading);`
  `if (isSearchLoading && !hasAny) return <ResultsSkeleton />;`
  Results now properly wait and show skeletons until queries resolve.

### D. Spotify Pathfinder Search for Curators, Users & Playlists
- **Problem**: Spotify aggressively throttles `https://api.spotify.com/v1/search` with HTTP 429 for web-player session tokens, returning zero search results.
- **Fix**:
  1. `web/desktop/src/spotify.ts`: Switched `searchSpotifyAll` to Spotify's official Pathfinder GraphQL endpoint (`operationName: "searchDesktop"`, sha256Hash: `0dff51c99e552b992377a2a6f40d213dc42b62db86ca0bcf16cf3934aec1aae6`). Returns HTTP 200 with zero rate limits!
  2. Extracts `users` (`id`, `displayName`, `username`, `image`), `playlists` (`name`, `images`, `owner.name`, `uri`), `tracks`, `albums`, and `artists`.
  3. `web/app/src/pages/SearchPage.tsx`: Added **Spotify Curators & Profiles** shelf displaying avatar circle, curator name, and `@username`. Clicking a curator navigates to `/search?q={curatorName}&source=spotify` to immediately show all their public playlists.

### E. Sidebar Playlist Saving ("Save them at side with their name")
- **Implementation**:
  1. `web/desktop/src/main.ts`: Added `pinnedPlaylists?: SpotifyPlaylist[]` store in `mellow_auth.json`.
  2. Implemented IPC handlers `spotify.followPlaylist` and `spotify.unfollowPlaylist`. Pinned playlists are prepended to `spotify.playlists` at offset 0.
  3. `web/app/src/pages/SearchPage.tsx`: Added a `BookmarkPlus` / `BookmarkCheck` button on `TopResult` cards for Spotify playlists.
  4. `web/app/src/pages/SpotifyPlaylistPage.tsx`: Added a `<SaveToSidebarButton>` next to the Sync button in `DetailHeader`.
  5. Clicking Save immediately saves the playlist and invalidates TanStack query cache `['spotify']`, causing it to instantly appear under "Spotify" in `Sidebar.tsx`. Right-clicking in the sidebar allows unfollowing.

---

## 4. Deep-Dive on Thumbnails & Artwork (For Your Next Tasks)

The user noted: *"cuz i think gpt will be able to make better thumbnail i guess"*. Here is the complete architecture of how thumbnails and artwork currently work in Mellow and where you can improve them:

### A. Current Artwork Files
- **`web/app/src/lib/artwork.ts`**:
  - `sizedArtwork(url: string, cssPx: number, aspect = 1): string`:
    YouTube CDN (`googleusercontent.com` / `ggpht.com`) resizes on demand using suffix `=w{px}-h{px}-l90-rj`.
    Mellow snaps requests to standard sizes (`[60, 120, 226, 544, 1200]`) to avoid CDN 429 burst rate limits.
  - `artworkAtPixels(url: string, px: number): string`: Exact pixel sizing for Discord RPC and OS Media Session.
- **`web/app/src/components/music/Artwork.tsx`**:
  - Renders `<div className="artwork-stroke">` with Apple's 0.5px inner hairline border.
  - Implements lazy loading (`loading="lazy"`, `decoding="async"`), `referrerPolicy="no-referrer"` (critical: YouTube blocks hotlinking if Referer header is sent), and retry fallback on error.
- **`web/app/src/components/music/CanvasArtwork.tsx`**:
  - Renders Spotify's looping vertical canvas videos in fullscreen and mini-player.
  - Resolves via `b.call('spotify.canvas', { trackId })`.
- **`web/app/src/lib/artworkColor.ts`**:
  - Extracts dominant colors from current track artwork using `FastAverageColor` / Canvas sampling to set `--ambient-glow-tint` and CSS radial gradient glow across the sidebar, header, and player bar.

### B. Known Challenges & Opportunities for Thumbnails
1. **YouTube Music vs YouTube Video Letterboxing**:
   - Audio tracks on YouTube Music typically have square artwork (`aspect = 1`).
   - Official music videos or user uploads have 16:9 thumbnails (`i.ytimg.com/vi/{id}/hqdefault.jpg`), which often have ugly black letterbox bars on top/bottom when forced into a square `1:1` card.
   - *Improvement*: For `i.ytimg.com` thumbnails rendered in square cards, automatically check aspect or apply a smart CSS zoom/center-crop (`object-cover scale-115`) to eliminate black bars.
2. **YouTube Thumbnail Quality Hierarchy**:
   - `hqdefault.jpg` is only 480x360.
   - `maxresdefault.jpg` is 1280x720, but returns 404 on older videos.
   - `sddefault.jpg` is 640x480.
   - *Improvement*: Implement an image fallback cascade for YouTube videos: try `maxresdefault.jpg` -> `sddefault.jpg` -> `hqdefault.jpg`.
3. **Lossless Cover Art Resolution from iTunes / Spotify**:
   - YouTube Music compression often degrades cover art (226px or 544px blurry covers).
   - Spotify provides crisp 640x640 covers (`ab67616d0000b273...`).
   - iTunes Search API (`https://itunes.apple.com/search?term={title}+{artist}&entity=song&limit=1`) provides ultra-high-resolution 1400x1400 / 3000x3000 original Apple Music album artwork for almost any song!
   - *Improvement*: Add a metadata enhancer that can resolve high-res cover art from Spotify/iTunes when YouTube only provides a low-res video frame.

---

## 5. Build, Package & Execution Commands

### To Build Web Frontend:
```cmd
cd /d E:\AntiGravity\BitChord\web && npx pnpm --filter @bitchord/app build
```

### To Build Desktop Process:
```cmd
cd /d E:\AntiGravity\BitChord\web\desktop && node build.js
```

### To Deploy dist to User's Installed Mellow App:
```powershell
Copy-Item -Path "E:\AntiGravity\BitChord\web\app\dist\*" -Destination "C:\Users\NotZeox\AppData\Local\Programs\Mellow\resources\app\dist" -Recurse -Force
Copy-Item -Path "E:\AntiGravity\BitChord\web\desktop\dist\*" -Destination "C:\Users\NotZeox\AppData\Local\Programs\Mellow\resources\app\dist" -Recurse -Force
```

### To Assemble Android APK:
```powershell
$env:GRADLE_USER_HOME="E:\AntiGravity\.gradle"
Set-Location "E:\AntiGravity\BitChord"
.\gradlew.bat :app:assembleDevDebug --console=plain
```

### To Commit & Push Changes:
```powershell
Set-Location "E:\AntiGravity\BitChord"
git add -A
git commit -m "Your descriptive commit message"
git push mellow main
```

---

## 6. Current Status & Verification Checklist
- **Git State**: Clean, all changes committed and pushed to `mellow main` (`75264dfa`).
- **Web App**: Builds cleanly with `pnpm build` (`dist/` generated in 10.9s, 0 TypeScript errors).
- **Desktop Backend**: `node build.js` succeeds. All assets deployed to `AppData\Local\Programs\Mellow`.
- **Android App**: Fully rebranded to Mellow, PC sync code added, compiled and verified (`Mellow.apk` in `release/android/`).
- **Search Bar**: Intermittent hover/cursor blocking resolved.
- **Spotify Search**: Working via Pathfinder GraphQL with Curators & Users + Sidebar saving.
