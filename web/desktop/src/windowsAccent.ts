import fs from 'node:fs';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const BACKUP_FILE = 'mellow-windows-accent-backup.json';

function requestScript(userDataPath: string, mode: 'apply' | 'restore', color = ''): string {
  const request = Buffer.from(JSON.stringify({
    userDataPath,
    mode,
    color,
  }), 'utf16le').toString('base64');

  return `
$ErrorActionPreference = 'Stop'
$request = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${request}')) | ConvertFrom-Json
$backupPath = Join-Path $request.userDataPath '${BACKUP_FILE}'
$entries = @(
  @{ Path = 'Software\\Microsoft\\Windows\\DWM'; Name = 'AccentColor' },
  @{ Path = 'Software\\Microsoft\\Windows\\DWM'; Name = 'ColorPrevalence' },
  @{ Path = 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Accent'; Name = 'AccentColorMenu' },
  @{ Path = 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Accent'; Name = 'StartColorMenu' },
  @{ Path = 'Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize'; Name = 'ColorPrevalence' },
  @{ Path = 'Control Panel\\Desktop'; Name = 'AutoColorization' }
)
$root = [Microsoft.Win32.Registry]::CurrentUser
function Save-Backup {
  $snapshot = @()
  foreach ($entry in $entries) {
    $key = $root.OpenSubKey($entry.Path, $false)
    $exists = $false
    $value = $null
    $kind = $null
    if ($key -and ($key.GetValueNames() -contains $entry.Name)) {
      $exists = $true
      $value = $key.GetValue($entry.Name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
      $kind = $key.GetValueKind($entry.Name).ToString()
    }
    if ($key) { $key.Dispose() }
    $snapshot += [pscustomobject]@{ Path = $entry.Path; Name = $entry.Name; Exists = $exists; Value = $value; Kind = $kind }
  }
  $snapshot | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $backupPath -Encoding UTF8
}
function Set-Dword($registryPath, $name, [uint32]$value) {
  $key = $root.CreateSubKey($registryPath)
  try { $key.SetValue($name, $value, [Microsoft.Win32.RegistryValueKind]::DWord) }
  finally { $key.Dispose() }
}
function Broadcast-SettingsChange {
  if (-not ('MellowAccentWin32' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class MellowAccentWin32 {
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out IntPtr lpdwResult);
}
'@
  }
  $result = [IntPtr]::Zero
  [void][MellowAccentWin32]::SendMessageTimeout([IntPtr]0xffff, 0x001A, [IntPtr]::Zero, 'ImmersiveColorSet', 0x0002, 1500, [ref]$result)
}
if ($request.mode -eq 'apply') {
  if (-not (Test-Path -LiteralPath $backupPath)) { Save-Backup }
  if ($request.color -match '^#[0-9a-fA-F]{6}$') {
    $hex = $request.color.Substring(1)
    $red = [Convert]::ToUInt32($hex.Substring(0, 2), 16)
    $green = [Convert]::ToUInt32($hex.Substring(2, 2), 16)
    $blue = [Convert]::ToUInt32($hex.Substring(4, 2), 16)
    # Windows accent DWORDs use ABGR byte order (opaque alpha, then blue/green/red).
    $abgr = [uint32](0xff000000 -bor ($blue -shl 16) -bor ($green -shl 8) -bor $red)
    Set-Dword 'Software\\Microsoft\\Windows\\DWM' 'AccentColor' $abgr
    Set-Dword 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Accent' 'AccentColorMenu' $abgr
    Set-Dword 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Accent' 'StartColorMenu' $abgr
    Set-Dword 'Software\\Microsoft\\Windows\\DWM' 'ColorPrevalence' 1
    Set-Dword 'Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize' 'ColorPrevalence' 1
    Set-Dword 'Control Panel\\Desktop' 'AutoColorization' 0
    Broadcast-SettingsChange
  }
} elseif ($request.mode -eq 'restore' -and (Test-Path -LiteralPath $backupPath)) {
  $snapshot = Get-Content -LiteralPath $backupPath -Raw | ConvertFrom-Json
  foreach ($saved in $snapshot) {
    $key = $root.OpenSubKey([string]$saved.Path, $true)
    try {
      if ($saved.Exists) {
        $kind = [Enum]::Parse([Microsoft.Win32.RegistryValueKind], [string]$saved.Kind)
        if (-not $key) { $key = $root.CreateSubKey([string]$saved.Path) }
        $key.SetValue([string]$saved.Name, $saved.Value, $kind)
      } else {
        if ($key) { $key.DeleteValue([string]$saved.Name, $false) }
      }
    } finally { if ($key) { $key.Dispose() } }
  }
  Remove-Item -LiteralPath $backupPath -Force
  Broadcast-SettingsChange
}
`;
}

function runPowerShell(userDataPath: string, mode: 'apply' | 'restore', color?: string, synchronous = false): Promise<void> | void {
  if (process.platform !== 'win32') return synchronous ? undefined : Promise.resolve();
  const command = requestScript(userDataPath, mode, color);
  const encoded = Buffer.from(command, 'utf16le').toString('base64');
  const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded];
  if (synchronous) {
    try {
      execFileSync('powershell.exe', args, { windowsHide: true, timeout: 5000, stdio: 'ignore' });
    } catch (error) {
      console.warn('Could not restore the previous Windows accent:', error);
    }
    return;
  }
  return execFileAsync('powershell.exe', args, { windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 })
    .then(() => undefined)
    .catch((error) => {
      console.warn('Could not update the Windows accent:', error);
      throw error;
    });
}

let pending = Promise.resolve();
let lastColor = '';
let requestedColor = '';
let accentGeneration = 0;

/**
 * Experimental per-user Windows accent sync. The saved snapshot is restored
 * when disabled, at shutdown, and on the next launch after an abnormal exit.
 */
export function setWindowsAccent(userDataPath: string, enabled: boolean, color?: string): Promise<void> {
  if (!enabled) {
    accentGeneration += 1;
    requestedColor = '';
    lastColor = '';
    pending = pending.catch(() => undefined).then(() => runPowerShell(userDataPath, 'restore') as Promise<void>);
    return pending;
  }
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return pending;
  const normalizedColor = color.toLowerCase();
  if (normalizedColor === requestedColor || normalizedColor === lastColor) return pending;
  requestedColor = normalizedColor;
  const generation = ++accentGeneration;
  pending = pending.catch(() => undefined).then(async () => {
    await runPowerShell(userDataPath, 'apply', color);
    if (generation === accentGeneration) lastColor = normalizedColor;
  }).catch((error) => {
    // A failed write must remain retryable when the same artwork color is
    // requested again (for example after Windows briefly rejects the update).
    if (generation === accentGeneration) {
      requestedColor = '';
      lastColor = '';
    }
    throw error;
  });
  return pending;
}

export function restoreWindowsAccent(userDataPath: string): void {
  accentGeneration += 1;
  requestedColor = '';
  lastColor = '';
  if (!fs.existsSync(path.join(userDataPath, BACKUP_FILE))) return;
  runPowerShell(userDataPath, 'restore', undefined, true);
}

export function restoreWindowsAccentAsync(userDataPath: string): Promise<void> {
  accentGeneration += 1;
  requestedColor = '';
  lastColor = '';
  pending = pending.catch(() => undefined).then(() => {
    if (!fs.existsSync(path.join(userDataPath, BACKUP_FILE))) return;
    return runPowerShell(userDataPath, 'restore') as Promise<void>;
  });
  return pending;
}

export function windowsAccentBackupPath(userDataPath: string): string {
  return path.join(userDataPath, BACKUP_FILE);
}
