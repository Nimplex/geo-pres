#!/bin/bash

install_imagemagick() {
    if command -v apt >/dev/null 2>&1; then
        echo "Using apt..."
        sudo apt update && sudo apt install -y imagemagick
    elif command -v dnf >/dev/null 2>&1; then
        echo "Using dnf..."
        sudo dnf install -y imagemagick
    elif command -v pacman >/dev/null 2>&1; then
        echo "Using pacman..."
        sudo pacman -Sy --noconfirm imagemagick
    elif command -v zypper >/dev/null 2>&1; then
        echo "Using zypper..."
        sudo zypper install -y imagemagick
    else
        echo "No supported package manager found. Install ImageMagick manually."
        exit 1
    fi
}

if ! command -v convert >/dev/null 2>&1; then
    echo "ImageMagick not found. Attempting installation..."
    install_imagemagick
fi

shopt -s nullglob

for file in *.png; do
    target="${file%.png}_transparent.png"
    if [[ -e "$target" ]]; then
        echo "Skipping $target (already exists)"
        continue
    fi
    echo "Processing $file"
    convert "$file" -fuzz 10% -transparent white "$target"
done
