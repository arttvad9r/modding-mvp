#!/usr/bin/env bash
set -euo pipefail

VERSION="18.6"
SHA256="555610c24d53e4316da5b7d3fc25c279d96856d5e0e23ee308c328c5fa881d9f"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREFIX="$ROOT/.tools/postgresql/$VERSION"
SOURCE_ROOT="$ROOT/.tools/postgresql-src"
ARCHIVE="$SOURCE_ROOT/postgresql-$VERSION.tar.bz2"
SOURCE_DIR="$SOURCE_ROOT/postgresql-$VERSION"
URL="https://ftp.postgresql.org/pub/source/v$VERSION/postgresql-$VERSION.tar.bz2"

if [[ -x "$PREFIX/bin/postgres" ]]; then
  "$PREFIX/bin/postgres" --version
  exit 0
fi

for command in curl sha256sum tar gcc make perl; do
  command -v "$command" >/dev/null || { echo "Missing build dependency: $command" >&2; exit 1; }
done

mkdir -p "$SOURCE_ROOT" "$ROOT/.tools/postgresql" "$ROOT/.tmp"
if [[ ! -f "$ARCHIVE" ]]; then
  curl -fsSL "$URL" -o "$ARCHIVE"
fi
echo "$SHA256  $ARCHIVE" | sha256sum -c -

rm -rf "$SOURCE_DIR"
tar -xjf "$ARCHIVE" -C "$SOURCE_ROOT"
cd "$SOURCE_DIR"
./configure --prefix="$PREFIX" --without-readline --without-zlib --without-icu \
  > "$ROOT/.tmp/postgresql-configure.log" 2>&1
make -j"${POSTGRES_BUILD_JOBS:-4}" > "$ROOT/.tmp/postgresql-make.log" 2>&1
make install > "$ROOT/.tmp/postgresql-install.log" 2>&1
"$PREFIX/bin/postgres" --version
