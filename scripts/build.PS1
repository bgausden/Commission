$tsc = "tsc"
$tscPath = Get-Command tsc -ErrorAction SilentlyContinue
if (-not $tscPath) {
    $tscPath = Get-Command .\node_modules\.bin\tsc -ErrorAction SilentlyContinue
    if (-not $tscPath) {
        Write-Error "TypeScript compiler 'tsc' not found in PATH or node_modules/.bin"
        exit 1
    }
    $tsc = ".\node_modules\.bin\tsc"
}

try {
    Copy-Item -Path .\log4js.json -Destination .\src\ -ErrorAction Stop
    try {
        & $tsc --build --verbose
    } catch {
        Write-Error "TypeScript compilation failed: $_"
        exit 1
    }
    Copy-Item -Path src\staffHurdle.json, .\log4js.json -Destination .\dist\ -ErrorAction Stop
    Write-Host "Build complete."
} catch {
    Write-Error "An error occurred: $_. Build failed."
    exit 1
}