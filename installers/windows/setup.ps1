# TaskPop for Windows - setup step run by the installer.
# The app runtime (Electron) is too large to ship inside the small installer, so it is
# downloaded here, checked against a fixed SHA-256 checksum, and assembled with TaskPop's files.
# When TaskPop is already installed with the same runtime (the usual case for an update), that
# runtime is reused instead, so nothing needs downloading.
# The installed copy is only replaced once the new one is complete.
#
# Exit codes: 0 = installed, 2 = download failed, 3 = checksum mismatch, 4 = other error.
# Written for Windows PowerShell 5.1 (built into Windows 10 and 11).

param(
  [Parameter(Mandatory = $true)][string]$Stage,
  [Parameter(Mandatory = $true)][string]$Dest
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # the progress bar slows downloads down a lot in 5.1
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch { }

$ElectronVersion = '44.4.5'
$Checksums = @{
  'x64'   = '11c395820a5aaa8ebcc0686b476d0ac98a730274ebfbdc8cf5538a7c2815cb5d'
  'arm64' = '92c19d550a80a8bd62fc801325b8135d4c45733a7d7fac2b5d6b95f2eed71b5f'
}

# 64-bit Intel/AMD or ARM (the installer itself may run as 32-bit, so check both variables)
$arch = 'x64'
if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { $arch = 'arm64' }

# Paths are always used literally (-LiteralPath), so folder names with [ ] work too.
$AppVersion = (Get-Content -Raw -LiteralPath (Join-Path (Join-Path $Stage 'app') 'package.json') | ConvertFrom-Json).version

# Which processor an .exe is built for (reads its PE header).
function Get-ExeArch([string]$File) {
  $fs = $null
  try {
    $fs = [System.IO.File]::OpenRead($File)
    $reader = New-Object System.IO.BinaryReader($fs)
    [void]$fs.Seek(0x3C, [System.IO.SeekOrigin]::Begin)
    $peOffset = $reader.ReadInt32()
    [void]$fs.Seek($peOffset + 4, [System.IO.SeekOrigin]::Begin)
    $machine = $reader.ReadUInt16()
    if ($machine -eq 0x8664) { return 'x64' }
    if ($machine -eq 0xAA64) { return 'arm64' }
    return ''
  } catch {
    return ''
  } finally {
    if ($fs) { $fs.Close() }
  }
}

# Reuse the installed runtime if it's the same version for this processor.
$reuse = $false
$installedExe = Join-Path $Dest 'TaskPop.exe'
$installedVersion = Join-Path $Dest 'version'
if ((Test-Path -LiteralPath $installedExe) -and (Test-Path -LiteralPath $installedVersion)) {
  $v = Get-Content -Raw -LiteralPath $installedVersion -ErrorAction SilentlyContinue
  if ($v -and ($v.Trim() -eq $ElectronVersion) -and ((Get-ExeArch $installedExe) -eq $arch)) { $reuse = $true }
}

$zip = Join-Path $Stage 'runtime.zip'
if (-not $reuse) {
  $url = "https://github.com/electron/electron/releases/download/v$ElectronVersion/electron-v$ElectronVersion-win32-$arch.zip"
  Write-Output "Downloading the rest of TaskPop ($arch, about 160 MB). This can take a minute or two..."
  try {
    $client = New-Object System.Net.WebClient
    $client.Headers.Add('User-Agent', "TaskPop-Setup/$AppVersion")
    $client.DownloadFile($url, $zip)
  } catch {
    Write-Output "Download failed: $($_.Exception.Message)"
    exit 2
  }

  Write-Output 'Checking the download...'
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash.ToLowerInvariant()
  if ($actual -ne $Checksums[$arch]) {
    Write-Output 'The downloaded file did not pass its safety check.'
    Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
    exit 3
  }
}

try {
  Write-Output "Installing TaskPop $AppVersion..."
  [void][System.IO.Directory]::CreateDirectory((Split-Path $Dest -Parent))
  $new = "$Dest.new"
  if (Test-Path -LiteralPath $new) { Remove-Item -LiteralPath $new -Recurse -Force }

  $res = Join-Path $new 'resources'
  $appDir = Join-Path $res 'app'
  if ($reuse) {
    Write-Output 'Using the app runtime that is already installed (nothing to download).'
    Copy-Item -LiteralPath $Dest -Destination $new -Recurse
    Remove-Item -LiteralPath $appDir -Recurse -Force
    if (Test-Path -LiteralPath $appDir) { throw 'The previous version''s files could not be removed.' }
  } else {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $new)
    Remove-Item -LiteralPath $zip -Force
    Rename-Item -LiteralPath (Join-Path $new 'electron.exe') -NewName 'TaskPop.exe'
  }
  Remove-Item -LiteralPath (Join-Path $res 'default_app.asar') -Force -ErrorAction SilentlyContinue
  Copy-Item -LiteralPath (Join-Path $Stage 'app') -Destination $appDir -Recurse
  Copy-Item -LiteralPath (Join-Path $Stage 'TaskPop.ico') -Destination $new -Force
  if (-not (Test-Path -LiteralPath (Join-Path $appDir 'main.js'))) { throw 'TaskPop''s files could not be copied.' }

  # Keep only the key-reading library for this PC's processor.
  $other = 'koffi-win32-arm64'
  if ($arch -eq 'arm64') { $other = 'koffi-win32-x64' }
  $koromix = Join-Path (Join-Path $appDir 'node_modules') '@koromix'
  Remove-Item -LiteralPath (Join-Path $koromix $other) -Recurse -Force -ErrorAction SilentlyContinue

  # Give TaskPop.exe its own icon and name (cosmetic, so a failure here doesn't stop the install).
  try {
    $rcedit = Join-Path $Stage 'rcedit.exe'
    & $rcedit (Join-Path $new 'TaskPop.exe') `
      --set-icon (Join-Path $Stage 'TaskPop.ico') `
      --set-version-string 'ProductName' 'TaskPop' `
      --set-version-string 'FileDescription' 'TaskPop' `
      --set-version-string 'CompanyName' 'asmlab' `
      --set-version-string 'LegalCopyright' 'Copyright 2026 asmlab' `
      --set-version-string 'OriginalFilename' 'TaskPop.exe' `
      --set-version-string 'InternalName' 'TaskPop' `
      --set-file-version $AppVersion `
      --set-product-version $AppVersion
    if ($LASTEXITCODE -ne 0) { Write-Output 'Note: the app icon could not be set.' }
  } catch {
    Write-Output 'Note: the app icon could not be set.'
  }

  # Swap the new version in.
  $old = "$Dest.old"
  if (Test-Path -LiteralPath $old) { Remove-Item -LiteralPath $old -Recurse -Force }
  if (Test-Path -LiteralPath $Dest) { Rename-Item -LiteralPath $Dest -NewName (Split-Path $old -Leaf) }
  Rename-Item -LiteralPath $new -NewName (Split-Path $Dest -Leaf)
  if (Test-Path -LiteralPath $old) { Remove-Item -LiteralPath $old -Recurse -Force -ErrorAction SilentlyContinue }
} catch {
  Write-Output "Install failed: $($_.Exception.Message)"
  if ($new -and (Test-Path -LiteralPath $new)) { Remove-Item -LiteralPath $new -Recurse -Force -ErrorAction SilentlyContinue }
  if ((-not (Test-Path -LiteralPath $Dest)) -and (Test-Path -LiteralPath "$Dest.old")) { Rename-Item -LiteralPath "$Dest.old" -NewName (Split-Path $Dest -Leaf) }
  exit 4
}

Write-Output 'TaskPop is installed.'
exit 0
