
$magick = Get-Command magick -ErrorAction SilentlyContinue
if (-not $magick) {
    Write-Host "ImageMagick installation failed or magick not in PATH."
    exit 1
}

Get-ChildItem -Filter *.png | ForEach-Object {
    $file = $_.FullName
    $target = [System.IO.Path]::Combine($_.DirectoryName, ($_.BaseName + "_transparent.png"))

    if (Test-Path $target) {
        Write-Host "Skipping $target (already exists)"
    } else {
        Write-Host "Processing $file"
        & magick $file -fuzz $fuzz -transparent white $target
    }
}
