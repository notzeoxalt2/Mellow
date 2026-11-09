param(
    [Parameter(Mandatory = $true)]
    [string]$ExePath,

    [string]$ProfilePath = (Join-Path $env:LOCALAPPDATA 'Temp\Mellow-QA-Isolated'),

    [ValidateRange(9222, 65535)]
    [int]$RemoteDebuggingPort = 0
)

$ErrorActionPreference = 'Stop'

$resolvedExe = (Resolve-Path -LiteralPath $ExePath).Path
if ([IO.Path]::GetFileName($resolvedExe) -ne 'Mellow.exe') {
    throw "Expected a packaged Mellow.exe, got: $resolvedExe"
}

$resolvedProfile = [IO.Path]::GetFullPath($ProfilePath)
if ($resolvedProfile -eq [IO.Path]::GetFullPath($env:APPDATA + '\mellow-desktop')) {
    throw 'The QA profile must stay separate from the normal Mellow user profile.'
}

New-Item -ItemType Directory -Path $resolvedProfile -Force | Out-Null
$profileArgument = '--user-data-dir="{0}"' -f $resolvedProfile
$arguments = @($profileArgument)
if ($RemoteDebuggingPort -gt 0) {
    # Bind CDP to loopback only. This is intended for local smoke checks.
    $arguments += "--remote-debugging-address=127.0.0.1"
    $arguments += "--remote-debugging-port=$RemoteDebuggingPort"
}
$process = Start-Process -FilePath $resolvedExe -ArgumentList $arguments -PassThru

[pscustomobject]@{
    ProcessId = $process.Id
    Executable = $resolvedExe
    IsolatedProfile = $resolvedProfile
    RemoteDebuggingPort = if ($RemoteDebuggingPort -gt 0) { $RemoteDebuggingPort } else { $null }
    NormalProfileTouched = $false
}
