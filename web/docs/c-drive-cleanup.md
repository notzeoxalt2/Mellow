# Safe C: cleanup helper

Run `scripts/clean-c-drive.bat` from File Explorer or a terminal. The helper
shows C: free space and a preview of the files it would remove. It only targets
user temp files older than 14 days, named disposable Chromium caches in
Mellow's normal user-data directory, and Chrome's component download cache. It
asks for the exact word `CLEAN` before deleting anything and skips files that
are locked or inaccessible. Close Mellow and Chrome first.

Close Mellow before running it. The helper refuses to clear its cache while
Mellow is open. It does not touch Mellow sign-in, preferences, library,
playback, IndexedDB, localStorage, Chrome profiles, cookies, history,
package-manager stores, downloads, projects, or release builds. It never requires administrator
rights. The PowerShell implementation skips filesystem reparse points and
rechecks each file path before removal.

For a read-only check, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\clean-c-drive.ps1 -PreviewOnly
```

To find which C: folders are using space, run `scripts/audit-c-drive.bat`.
It recursively totals file sizes without reading file contents, skips reparse
points, and makes no changes. Pass a folder path to drill into it, for example
`scripts/audit-c-drive.bat C:\Users`. This can take a few minutes on a large
or busy drive.

The cleanup helper only frees space represented by the listed targets. If C:
remains full, use the audit report and Windows Settings > System > Storage to
review the largest categories; do not delete large folders just because their
names look unfamiliar.
