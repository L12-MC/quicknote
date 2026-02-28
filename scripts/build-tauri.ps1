[CmdletBinding()]
param(
    [string]$VsInstallPath,
    [string]$ProjectRoot,
    [string]$BuildCommand = "npm run tauri build"
)

$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
    Write-Error $Message
    exit 1
}

function Resolve-VsInstallPath {
    param([string]$Hint)

    if ($Hint -and (Test-Path $Hint)) {
        return (Resolve-Path $Hint).Path
    }

    $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vswhere) {
        $path = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
        if ($LASTEXITCODE -eq 0 -and $path) {
            return $path.Trim()
        }
    }

    $commonPath = "C:\Program Files\Microsoft Visual Studio\2022\Community"
    if (Test-Path $commonPath) {
        return $commonPath
    }

    return $null
}

if (-not $ProjectRoot) {
    $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $PSCommandPath }
    $ProjectRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
}

$resolvedVsPath = Resolve-VsInstallPath -Hint $VsInstallPath
if (-not $resolvedVsPath) {
    Fail "Visual Studio with C++ tools not found. Install 'Desktop development with C++' from Visual Studio Installer."
}

$devShellModule = Join-Path $resolvedVsPath "Common7\Tools\Microsoft.VisualStudio.DevShell.dll"
if (-not (Test-Path $devShellModule)) {
    Fail "DevShell module not found at '$devShellModule'."
}

Import-Module $devShellModule
Enter-VsDevShell -VsInstallPath $resolvedVsPath -DevCmdArguments "-arch=x64 -host_arch=x64" | Out-Null

$linkPath = (& where.exe link 2>$null)
if (-not $linkPath) {
    Fail "link.exe is still not available. Ensure MSVC build tools are installed."
}

$sdkLibRoot = "C:\Program Files (x86)\Windows Kits\10\Lib"
if (-not (Test-Path $sdkLibRoot)) {
    Fail "Windows SDK libraries not found at '$sdkLibRoot'. Install a Windows 10/11 SDK component from Visual Studio Installer."
}

$kernelLib = Get-ChildItem $sdkLibRoot -Recurse -Filter kernel32.lib -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $kernelLib) {
    Fail "kernel32.lib not found in Windows SDK lib paths. Install or repair Windows SDK."
}

Push-Location $ProjectRoot
try {
    Write-Host "Using Visual Studio: $resolvedVsPath"
    Write-Host "Using linker: $($linkPath | Select-Object -First 1)"
    Write-Host "Using kernel32.lib: $($kernelLib.FullName)"
    Write-Host "Running: $BuildCommand"

    Invoke-Expression $BuildCommand
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}
finally {
    Pop-Location
}
