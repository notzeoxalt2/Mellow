param([switch]$PreviewOnly)

$ErrorActionPreference = 'Stop'

$cutoff = (Get-Date).AddDays(-14)
$tempRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Temp')).TrimEnd('\')
$protectedTempRoots = @(
    (Join-Path $tempRoot 'morrow-chrome-render-profile'),
    (Join-Path $tempRoot 'morrow-desktop-player-preview')
) | ForEach-Object { [IO.Path]::GetFullPath($_).TrimEnd('\') }
$mellowRoot = [IO.Path]::GetFullPath((Join-Path $env:APPDATA 'mellow-desktop')).TrimEnd('\')
$chromeComponentCache = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data\component_crx_cache')).TrimEnd('\')
$cacheNames = @(
    'Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'ShaderCache', 'GrShaderCache'
)
$cacheTargets = @($cacheNames | ForEach-Object { Join-Path $mellowRoot $_ })
$cacheTargets += Join-Path (Join-Path $mellowRoot 'Service Worker') 'CacheStorage'
$cacheTargets += $chromeComponentCache

function Get-SafeFiles([string]$Root) {
    if (-not (Test-Path -LiteralPath $Root -PathType Container)) { return }
    $pending = [Collections.Generic.Stack[string]]::new()
    $pending.Push($Root)
    while ($pending.Count -gt 0) {
        $current = $pending.Pop()
        try { $children = Get-ChildItem -LiteralPath $current -Force -ErrorAction Stop }
        catch { continue }
        foreach ($child in $children) {
            if (($child.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
            if ($child.PSIsContainer) {
                $childPath = [IO.Path]::GetFullPath($child.FullName).TrimEnd('\')
                $isProtectedProfile = $false
                # Chromium uses scoped_dir* folders for temporary extension
                # installs/profiles. They live under Temp but are not ordinary
                # stale scratch files, so leave them alone.
                if ([string]::Equals($fullRoot, $tempRoot, [StringComparison]::OrdinalIgnoreCase) -and
                    $child.Name -like 'scoped_dir*') {
                    $isProtectedProfile = $true
                }
                foreach ($protectedRoot in $protectedTempRoots) {
                    if ([string]::Equals($childPath, $protectedRoot, [StringComparison]::OrdinalIgnoreCase) -or
                        $childPath.StartsWith(($protectedRoot + '\'), [StringComparison]::OrdinalIgnoreCase)) {
                        $isProtectedProfile = $true
                        break
                    }
                }
                if (-not $isProtectedProfile) { $pending.Push($child.FullName) }
            }
            else { $child }
        }
    }
}

function Get-RootedFiles([string]$Root) {
    $fullRoot = [IO.Path]::GetFullPath($Root).TrimEnd('\')
    $allowedTemp = [string]::Equals($fullRoot, $tempRoot, [StringComparison]::OrdinalIgnoreCase)
    $allowedCache = $false
    $mellowPrefix = $mellowRoot + '\'
    foreach ($target in $cacheTargets) {
        $fullTarget = [IO.Path]::GetFullPath($target).TrimEnd('\')
        $isMellowCache = $fullRoot.StartsWith($mellowPrefix, [StringComparison]::OrdinalIgnoreCase)
        $isExactChromeCache = [string]::Equals($fullRoot, $chromeComponentCache, [StringComparison]::OrdinalIgnoreCase)
        if ([string]::Equals($fullRoot, $fullTarget, [StringComparison]::OrdinalIgnoreCase) -and
            ($isMellowCache -or $isExactChromeCache)) {
            $allowedCache = $true
            break
        }
    }
    if (-not ($allowedTemp -or $allowedCache)) { throw "Refusing unapproved cleanup path: $fullRoot" }
    return @(Get-SafeFiles -Root $fullRoot)
}

$tempFiles = @(Get-RootedFiles -Root $tempRoot | Where-Object { $_.LastWriteTime -lt $cutoff })
$mellowCacheFiles = @()
$chromeCacheFiles = @()
foreach ($target in $cacheTargets) {
    if (Test-Path -LiteralPath $target -PathType Container) {
        $files = @(Get-RootedFiles -Root $target)
        if ([string]::Equals([IO.Path]::GetFullPath($target).TrimEnd('\'), $chromeComponentCache, [StringComparison]::OrdinalIgnoreCase)) {
            $chromeCacheFiles += $files
        } else {
            $mellowCacheFiles += $files
        }
    }
}
$allTargets = @($tempFiles + $mellowCacheFiles + $chromeCacheFiles | Sort-Object -Property FullName -Unique)
$estimatedBytes = ($allTargets | Measure-Object -Property Length -Sum).Sum
if (-not $estimatedBytes) { $estimatedBytes = 0 }
$driveBefore = Get-PSDrive -Name C

Write-Host "C: free before: $([math]::Round($driveBefore.Free / 1GB, 2)) GiB"
Write-Host "Old temp files (older than 14 days): $($tempFiles.Count) | $([math]::Round((($tempFiles | Measure-Object Length -Sum).Sum / 1MB), 1)) MiB"
Write-Host "Mellow disposable cache files: $($mellowCacheFiles.Count) | $([math]::Round((($mellowCacheFiles | Measure-Object Length -Sum).Sum / 1MB), 1)) MiB"
Write-Host "Chrome component download cache: $($chromeCacheFiles.Count) | $([math]::Round((($chromeCacheFiles | Measure-Object Length -Sum).Sum / 1MB), 1)) MiB"
Write-Host "Potential total: $([math]::Round($estimatedBytes / 1MB, 1)) MiB"
Write-Host 'Protected: Chrome profiles, cookies, sign-ins, history, downloads, projects, package stores, and release builds.'
Write-Host 'First cleanup paths:'
$allTargets | Select-Object -First 20 | ForEach-Object { Write-Host "  $($_.FullName)" }
if ($allTargets.Count -gt 20) { Write-Host "  ... and $($allTargets.Count - 20) more matched files" }
if ($allTargets.Count -eq 0) {
    Write-Host 'Nothing matched the cleanup rules.'
    exit 0
}
if ($PreviewOnly) {
    Write-Host 'Preview only. No files were changed.'
    exit 0
}

if (Get-Process -Name Mellow -ErrorAction SilentlyContinue) {
    Write-Host 'Mellow is running. Close it before clearing its disposable cache; no files were changed.' -ForegroundColor Yellow
    exit 2
}
if ($chromeCacheFiles.Count -gt 0 -and (Get-Process -Name chrome -ErrorAction SilentlyContinue)) {
    Write-Host 'Chrome is running. Close Chrome before clearing its component download cache; no files were changed.' -ForegroundColor Yellow
    exit 2
}

$confirmation = Read-Host 'Review the totals above. Type CLEAN to delete only these files'
if ($confirmation -cne 'CLEAN') {
    Write-Host 'Cancelled. No files were changed.'
    exit 0
}

$deletedBytes = [long]0
$deletedCount = 0
$failedCount = 0
foreach ($file in $allTargets) {
    try {
        # Re-check each target immediately before deletion and keep it under one of
        # the exact approved roots. Reparse points were excluded during traversal.
        $path = [IO.Path]::GetFullPath($file.FullName)
        $underTemp = $path.StartsWith(($tempRoot + '\'), [StringComparison]::OrdinalIgnoreCase)
        $underApprovedCache = $false
        foreach ($target in $cacheTargets) {
            $prefix = [IO.Path]::GetFullPath($target).TrimEnd('\') + '\'
            $isMellowCache = $prefix.StartsWith($mellowPrefix, [StringComparison]::OrdinalIgnoreCase)
            $isExactChromeCache = [string]::Equals([IO.Path]::GetFullPath($target).TrimEnd('\'), $chromeComponentCache, [StringComparison]::OrdinalIgnoreCase)
            if ($path.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -and ($isMellowCache -or $isExactChromeCache)) {
                $underApprovedCache = $true
                break
            }
        }
        if (-not ($underTemp -or $underApprovedCache)) { throw "Refusing unapproved file path: $path" }
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { continue }
        $size = (Get-Item -LiteralPath $path -Force).Length
        Remove-Item -LiteralPath $path -Force -ErrorAction Stop
        $deletedBytes += $size
        $deletedCount++
    } catch {
        $failedCount++
    }
}

$driveAfter = Get-PSDrive -Name C
Write-Host "Removed $deletedCount files ($([math]::Round($deletedBytes / 1MB, 1)) MiB); $failedCount locked or unavailable files skipped."
Write-Host "C: free after: $([math]::Round($driveAfter.Free / 1GB, 2)) GiB"
Write-Host 'No directory tree, user profile database, or app release was removed.'
