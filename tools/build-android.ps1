param([string]$ToolsRoot = 'D:\Foodlenscare-Android')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$env:JAVA_HOME = Join-Path $ToolsRoot 'jdk\jdk21'
$env:ANDROID_HOME = Join-Path $ToolsRoot 'sdk'
$env:ANDROID_USER_HOME = Join-Path $ToolsRoot 'android-user'
$env:GRADLE_USER_HOME = Join-Path $ToolsRoot 'gradle-cache'
$env:npm_config_cache = Join-Path $ToolsRoot 'npm-cache'
foreach ($required in @((Join-Path $env:JAVA_HOME 'bin\javac.exe'), (Join-Path $env:JAVA_HOME 'bin\jlink.exe'), (Join-Path $env:ANDROID_HOME 'platforms\android-36\android.jar'))) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Missing build tool: $required" }
}
Push-Location $projectRoot
try {
    & npm.cmd run typecheck
    if ($LASTEXITCODE -ne 0) { throw 'Type check failed' }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
    & npx.cmd cap sync android
    if ($LASTEXITCODE -ne 0) { throw 'Android sync failed' }
    Push-Location (Join-Path $projectRoot 'android')
    try { & .\gradlew.bat assembleDebug --no-daemon --console plain; if ($LASTEXITCODE -ne 0) { throw 'Android build failed' } }
    finally { Pop-Location }
    $output = Join-Path $ToolsRoot 'apk'
    New-Item -ItemType Directory -Path $output -Force | Out-Null
    $apk = Join-Path $output 'Foodlenscare-Android-Demo.apk'
    Copy-Item -LiteralPath (Join-Path $projectRoot 'android\app\build\outputs\apk\debug\app-debug.apk') -Destination $apk -Force
    Write-Output "APK: $apk"
    $stream = [System.IO.File]::OpenRead($apk)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { Write-Output ('SHA256: ' + [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()) }
    finally { $stream.Dispose(); $sha.Dispose() }
} finally { Pop-Location }
