#!/usr/bin/env bash
set -euo pipefail

VERSION="2.0.77"
SHA256="c4efc11529f74d37c96933e291e0db73fd9f5aa4738913d9301b24680b3e947f"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS_DIR="$ROOT_DIR/.tools"
FACTORIO_DIR="$TOOLS_DIR/factorio"
URL="https://factorio.com/get-download/${VERSION}/headless/linux64"
# Whole-install deadline: lock wait, download (all retries), verification and extraction.
INSTALL_TIMEOUT_S="${FACTORIO_INSTALL_TIMEOUT_S:-900}"

installed() {
  [[ -x "$FACTORIO_DIR/bin/x64/factorio" ]] \
    && "$FACTORIO_DIR/bin/x64/factorio" --version | head -1 | grep -Fq "Version: $VERSION"
}

mkdir -p "$TOOLS_DIR"

if installed; then
  echo "Factorio headless $VERSION is already installed."
  exit 0
fi

# Only one writer may install into a shared cache (e.g. a volume used by several workers).
exec 9>"$TOOLS_DIR/.factorio-install.lock"
if ! flock -w "$INSTALL_TIMEOUT_S" 9; then
  echo "Timed out after ${INSTALL_TIMEOUT_S}s waiting for another Factorio install." >&2
  exit 1
fi
if installed; then
  echo "Factorio headless $VERSION was installed by another process."
  exit 0
fi

STAGING="$(mktemp -d "$TOOLS_DIR/.factorio-staging.XXXXXX")"
trap 'rm -rf "$STAGING"' EXIT
ARCHIVE="$STAGING/factorio-headless_${VERSION}.tar.xz"

echo "Downloading Factorio headless $VERSION..."
curl -fL --connect-timeout 30 --retry 3 --retry-max-time "$INSTALL_TIMEOUT_S" \
  --max-time "$INSTALL_TIMEOUT_S" "$URL" -o "$ARCHIVE"

echo "$SHA256  $ARCHIVE" | sha256sum --check --status || {
  echo "Checksum verification failed." >&2
  exit 1
}

# Extract into staging and swap in place, so an interrupted install never leaves a partial runtime.
tar -xJf "$ARCHIVE" -C "$STAGING"
rm -rf "$FACTORIO_DIR"
mv "$STAGING/factorio" "$FACTORIO_DIR"

"$FACTORIO_DIR/bin/x64/factorio" --version | head -1
