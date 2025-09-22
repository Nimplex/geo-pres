$magick = Get-Command magick -ErrorAction SilentlyContinue
if (-not $magick) {
    Write-Host "ImageMagick installation failed or magick not in PATH."
    exit 1
}

$fuzz = "10%"  # or whatever fuzz you need

Get-ChildItem -Filter *.png | ForEach-Object {
    $file = $_.FullName
    $baseName = $_.BaseName

    if ($baseName -like "*_transparent*") {
        Write-Host "Skipping $file (already transparent)"
        return
    }

    $target = [System.IO.Path]::Combine($_.DirectoryName, ($baseName + "_transparent.png"))

    if (Test-Path $target) {
        Write-Host "Skipping $target (already exists)"
    } else {
        Write-Host "Processing $file"
        & magick $file -fuzz $fuzz -transparent white $target
    }
}