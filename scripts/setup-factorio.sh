#!/usr/bin/env bash
set -euo pipefail

VERSION="2.0.77"
SHA256="c4efc11529f74d37c96933e291e0db73fd9f5aa4738913d9301b24680b3e947f"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS_DIR="$ROOT_DIR/.tools"
FACTORIO_DIR="$TOOLS_DIR/factorio"
ARCHIVE="$TOOLS_DIR/factorio-headless_${VERSION}.tar.xz"
URL="https://factorio.com/get-download/${VERSION}/headless/linux64"

mkdir -p "$TOOLS_DIR"

if [[ -x "$FACTORIO_DIR/bin/x64/factorio" ]] && "$FACTORIO_DIR/bin/x64/factorio" --version | head -1 | grep -Fq "Version: $VERSION"; then
  echo "Factorio headless $VERSION is already installed."
  exit 0
fi

rm -rf "$FACTORIO_DIR"
echo "Downloading Factorio headless $VERSION..."
curl -fL --retry 3 "$URL" -o "$ARCHIVE"

echo "$SHA256  $ARCHIVE" | sha256sum --check --status || {
  echo "Checksum verification failed." >&2
  rm -f "$ARCHIVE"
  exit 1
}

tar -xJf "$ARCHIVE" -C "$TOOLS_DIR"
rm -f "$ARCHIVE"

"$FACTORIO_DIR/bin/x64/factorio" --version | head -1
