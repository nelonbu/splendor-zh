$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$source = Join-Path $PSScriptRoot 'Program.cs'
$output = Join-Path $projectRoot 'SplendorLocal.exe'
$dist = Join-Path $projectRoot 'dist'

if (-not (Test-Path -LiteralPath $compiler)) {
    throw 'Windows .NET Framework C# compiler was not found.'
}

Push-Location $projectRoot
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
} finally {
    Pop-Location
}

if (-not (Test-Path -LiteralPath (Join-Path $dist 'index.html'))) {
    throw 'dist/index.html was not created.'
}

$archive = Join-Path ([System.IO.Path]::GetTempPath()) ('splendor-assets-' + [guid]::NewGuid().ToString('N') + '.zip')
try {
    Compress-Archive -Path (Join-Path $dist '*') -DestinationPath $archive
    & $compiler /nologo /codepage:65001 /target:exe /reference:System.IO.Compression.dll /out:$output "/resource:$archive,GameAssets" $source
    if ($LASTEXITCODE -ne 0) { throw 'Launcher compilation failed.' }
    Write-Host "Created $output"
} finally {
    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
}
