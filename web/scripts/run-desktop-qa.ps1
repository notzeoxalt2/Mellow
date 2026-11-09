param(
    [string]$ExePath,

    [string]$ProfilePath = (Join-Path $env:LOCALAPPDATA 'Temp\Mellow-QA-Automated'),

    [ValidateRange(1, 180)]
    [int]$StartupTimeoutSeconds = 45
)

$ErrorActionPreference = 'Stop'

$scriptsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$webDir = Split-Path -Parent $scriptsDir
if ([string]::IsNullOrWhiteSpace($ExePath)) {
    $releaseDir = Join-Path $webDir 'release'
    $candidate = Get-ChildItem -LiteralPath $releaseDir -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like 'Mellow-win32-x64-*' -and (Test-Path -LiteralPath (Join-Path $_.FullName 'Mellow.exe')) } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if (-not $candidate) {
        throw "No packaged Mellow candidate found in $releaseDir. Build/package the app or pass -ExePath explicitly."
    }
    $ExePath = Join-Path $candidate.FullName 'Mellow.exe'
    Write-Output "Auto-selected newest packaged candidate: $ExePath"
}
$resolvedExe = (Resolve-Path -LiteralPath $ExePath).Path
if ([IO.Path]::GetFileName($resolvedExe) -ne 'Mellow.exe') {
    throw "Expected a packaged Mellow.exe, got: $resolvedExe"
}

$normalProfile = [IO.Path]::GetFullPath((Join-Path $env:APPDATA 'mellow-desktop')).TrimEnd('\')
$resolvedProfile = [IO.Path]::GetFullPath($ProfilePath).TrimEnd('\')
$normalPrefix = $normalProfile + '\'
$profilePrefix = $resolvedProfile + '\'
if ([string]::Equals($resolvedProfile, $normalProfile, [StringComparison]::OrdinalIgnoreCase) -or
    $resolvedProfile.StartsWith($normalPrefix, [StringComparison]::OrdinalIgnoreCase) -or
    $normalProfile.StartsWith($profilePrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "QA profile must be separate from the normal Mellow profile: $normalProfile"
}

$existingQaProcess = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
        $_.Name -in @('Mellow.exe', 'electron.exe') -and $_.CommandLine -and
        $_.CommandLine.IndexOf($resolvedProfile, [StringComparison]::OrdinalIgnoreCase) -ge 0
    } |
    Select-Object -First 1
if ($existingQaProcess) {
    throw "QA profile is already in use by PID $($existingQaProcess.ProcessId). Close that isolated QA run before reusing the profile."
}

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = ([Net.IPEndPoint]$listener.LocalEndpoint).Port
$listener.Stop()

$mainProcessId = $null
$startedAt = Get-Date
try {
    $launched = & (Join-Path $scriptsDir 'launch-qa-candidate.ps1') `
        -ExePath $resolvedExe `
        -ProfilePath $resolvedProfile `
        -RemoteDebuggingPort $port
    $mainProcessId = [int]$launched.ProcessId

    $cdpUrl = "http://127.0.0.1:$port/json/version"
    $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
    $ready = $false
    while ((Get-Date) -lt $deadline) {
        try {
            $version = Invoke-RestMethod -Uri $cdpUrl -TimeoutSec 2
            if ($version.webSocketDebuggerUrl -like "ws://127.0.0.1:$port/*") {
                $ready = $true
                break
            }
        } catch {
            Start-Sleep -Milliseconds 250
        }
    }
    if (-not $ready) {
        # CIM can briefly omit a freshly launched Electron process (or a child
        # can own Chromium after the original process has handed off). Check
        # process state only after the loopback endpoint has had its full
        # startup window, and identify the isolated profile before describing
        # the failure. The endpoint remains the readiness authority.
        $qaProcesses = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object {
                $_.Name -in @('Mellow.exe', 'electron.exe') -and $_.CommandLine -and
                $_.CommandLine.IndexOf($resolvedProfile, [StringComparison]::OrdinalIgnoreCase) -ge 0
            })
        $mainProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $mainProcessId" -ErrorAction SilentlyContinue
        if (-not $mainProcess -and $qaProcesses.Count -eq 0) {
            throw "QA app exited before its local DevTools endpoint became ready (PID $mainProcessId, profile $resolvedProfile)."
        }
        throw "QA app did not expose its loopback DevTools endpoint within $StartupTimeoutSeconds seconds (PID $mainProcessId; $($qaProcesses.Count) isolated process(es) still running)."
    }

    Push-Location (Split-Path -Parent $scriptsDir)
    try {
        & node (Join-Path $scriptsDir 'desktop-smoke.mjs') $port
        if ($LASTEXITCODE -ne 0) { throw "Desktop interaction smoke failed with exit code $LASTEXITCODE." }
    } finally {
        Pop-Location
    }

    $profileBytes = if (Test-Path -LiteralPath $resolvedProfile) {
        (Get-ChildItem -LiteralPath $resolvedProfile -File -Recurse -Force -ErrorAction SilentlyContinue |
            Measure-Object -Property Length -Sum).Sum
    } else { 0 }
    [pscustomobject]@{
        ok = $true
        executable = $resolvedExe
        isolatedProfile = $resolvedProfile
        loopbackPort = $port
        elapsedSeconds = [math]::Round(((Get-Date) - $startedAt).TotalSeconds, 1)
        profileBytes = $profileBytes
        profileCleanup = 'retained for repeat runs; no profile files were removed'
        normalProfileTouched = $false
    } | ConvertTo-Json -Depth 4
} finally {
    if ($mainProcessId) {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $mainProcessId" -ErrorAction SilentlyContinue
        if ($proc -and [string]::Equals($proc.ExecutablePath, $resolvedExe, [StringComparison]::OrdinalIgnoreCase)) {
            # Kill only the process tree rooted at the exact QA executable launched above.
            & taskkill.exe /PID $mainProcessId /T /F | Out-Null
        }

        $shutdownDeadline = (Get-Date).AddSeconds(20)
        do {
            $remainingQaProcess = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
                Where-Object {
                    $_.Name -in @('Mellow.exe', 'electron.exe') -and $_.CommandLine -and
                    $_.CommandLine.IndexOf($resolvedProfile, [StringComparison]::OrdinalIgnoreCase) -ge 0
                } |
                Select-Object -First 1
            if (-not $remainingQaProcess) { break }
            Start-Sleep -Milliseconds 250
        } while ((Get-Date) -lt $shutdownDeadline)

        # Recheck after the wait so a process that exited at the deadline is
        # not misreported using the last in-loop snapshot.
        $remainingQaProcess = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object {
                $_.Name -in @('Mellow.exe', 'electron.exe') -and $_.CommandLine -and
                $_.CommandLine.IndexOf($resolvedProfile, [StringComparison]::OrdinalIgnoreCase) -ge 0
            } |
            Select-Object -First 1

        if ($remainingQaProcess) {
            # A Chromium child can outlive the first taskkill tree during a
            # slow Windows shutdown. It is safe to terminate only a process
            # still advertising this run's unique isolated profile.
            & taskkill.exe /PID $remainingQaProcess.ProcessId /T /F | Out-Null
            $finalDeadline = (Get-Date).AddSeconds(8)
            do {
                $remainingQaProcess = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
                    Where-Object {
                        $_.Name -in @('Mellow.exe', 'electron.exe') -and $_.CommandLine -and
                        $_.CommandLine.IndexOf($resolvedProfile, [StringComparison]::OrdinalIgnoreCase) -ge 0
                    } |
                    Select-Object -First 1
                if (-not $remainingQaProcess) { break }
                Start-Sleep -Milliseconds 250
            } while ((Get-Date) -lt $finalDeadline)
        }
        if ($remainingQaProcess) {
            throw "QA process tree did not fully exit; remaining PID $($remainingQaProcess.ProcessId). Isolated profile was retained."
        }
    }
}
