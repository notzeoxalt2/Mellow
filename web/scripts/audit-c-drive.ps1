param(
    [string]$FolderPath = 'C:\',
    [int]$Top = 30
)

$ErrorActionPreference = 'Stop'
$drivePath = 'C:\'
$scanPath = [IO.Path]::GetFullPath($FolderPath)
if (-not $scanPath.EndsWith('\')) { $scanPath += '\' }
if (-not $scanPath.StartsWith($drivePath, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'FolderPath must be inside C:\'
}
if (-not (Test-Path -LiteralPath $scanPath -PathType Container)) { throw "Folder does not exist: $scanPath" }
if ($Top -lt 1 -or $Top -gt 100) { throw 'Top must be from 1 to 100' }

$driveName = 'C'
$drive = Get-PSDrive -Name $driveName
Write-Host "Read-only disk usage audit for $scanPath"
Write-Host "Free: $([math]::Round($drive.Free / 1GB, 2)) GiB | Used: $([math]::Round($drive.Used / 1GB, 2)) GiB"
Write-Host 'Scanning immediate subfolders. This reads sizes only; it does not open file contents or delete anything.'

$pending = [Collections.Generic.Stack[string]]::new()
$totals = [Collections.Generic.List[object]]::new()
$skipped = 0
$entries = @(Get-ChildItem -LiteralPath $scanPath -Force -Directory -ErrorAction SilentlyContinue)
foreach ($entry in $entries) {
    if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) {
        $pending.Push($entry.FullName)
    } else {
        $skipped++
    }
}

$rootBytes = [long]0
Get-ChildItem -LiteralPath $scanPath -Force -File -ErrorAction SilentlyContinue | ForEach-Object { $rootBytes += $_.Length }
$totals.Add([pscustomobject]@{ Path = $scanPath; Bytes = $rootBytes })

while ($pending.Count -gt 0) {
    $root = $pending.Pop()
    Write-Host "Scanning $root"
    $bytes = [long]0
    $todo = [Collections.Generic.Stack[string]]::new()
    $todo.Push($root)
    while ($todo.Count -gt 0) {
        $current = $todo.Pop()
        try {
            foreach ($child in [IO.Directory]::EnumerateFileSystemEntries($current)) {
                try {
                    $attributes = [IO.File]::GetAttributes($child)
                    if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                        $skipped++
                    } elseif (($attributes -band [IO.FileAttributes]::Directory) -ne 0) {
                        $todo.Push($child)
                    } else {
                        $bytes += ([IO.FileInfo]::new($child)).Length
                    }
                } catch { $skipped++ }
            }
        } catch { $skipped++ }
    }
    $totals.Add([pscustomobject]@{ Path = $root; Bytes = $bytes })
    Write-Progress -Activity "Scanning $scanPath folders" -Status $root -PercentComplete ([math]::Min(99, 100 * ($entries.Count - $pending.Count) / [math]::Max(1, $entries.Count)))
}
Write-Progress -Activity "Scanning $scanPath folders" -Completed

$totals | Sort-Object Bytes -Descending | Select-Object -First $Top | ForEach-Object {
    [pscustomobject]@{ GiB = [math]::Round($_.Bytes / 1GB, 2); MiB = [math]::Round($_.Bytes / 1MB, 0); Folder = $_.Path }
} | Format-Table -AutoSize
Write-Host "Unreadable/linked entries skipped: $skipped"
Write-Host 'Audit complete. No files were changed.'
