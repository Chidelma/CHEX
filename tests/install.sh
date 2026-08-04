#!/bin/sh
# Regression checks for the fail-closed checksum logic in scripts/install.sh.
#
#   sh tests/install.sh
#
# Serves a fake release over file:// and rewrites only BASE and the install
# directory, so the verification block under test is the real one. Every case
# here installed an unverified binary before the checks were made to fail closed.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
SRC="${1:-$ROOT/scripts/install.sh}"

if command -v sha256sum >/dev/null 2>&1; then
    HASH="sha256sum"
elif command -v shasum >/dev/null 2>&1; then
    HASH="shasum -a 256"
else
    echo "skip: neither sha256sum nor shasum is available" >&2
    exit 0
fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# Mirrors the real layout so both URL shapes resolve: latest/download/<asset>
# and download/<tag>/<asset>.
PINNED_TAG="v26.28.02"
RELEASES="$WORK/releases"
RELEASE="$RELEASES/latest/download"
PINNED="$RELEASES/download/$PINNED_TAG"
DEST="$WORK/bin"
mkdir -p "$RELEASE" "$PINNED" "$DEST"

# The installer picks its asset from uname; build the fake release to match.
case "$(uname -s)" in
    Darwin) os_tag="macos" ;;
    Linux) os_tag="linux" ;;
    *) echo "skip: unsupported OS for this test" >&2; exit 0 ;;
esac
case "$(uname -m)" in
    x86_64 | amd64) arch_tag="x64" ;;
    arm64 | aarch64) arch_tag="arm64" ;;
    *) echo "skip: unsupported architecture for this test" >&2; exit 0 ;;
esac
ASSET="chex-${os_tag}-${arch_tag}"

sums() { ( cd "$RELEASE" && $HASH "$ASSET" > SHA256SUMS ); }

printf 'genuine binary\n' > "$RELEASE/$ASSET"
sums

# The pinned release carries a distinguishable payload, so the test can tell
# which URL the installer actually fetched from.
printf 'pinned binary\n' > "$PINNED/$ASSET"
( cd "$PINNED" && $HASH "$ASSET" > SHA256SUMS )

sed -e "s|^RELEASES=.*|RELEASES=\"file://$RELEASES\"|" \
    -e "s|^if \[ -w /usr/local/bin \]; then|if false; then|" \
    -e "s|^    dest=\"\${HOME}/.local/bin\"|    dest=\"$DEST\"|" \
    "$SRC" > "$WORK/install.sh"

pass=0
fail=0

check() {
    if [ "$2" = "$3" ]; then
        echo "  ok   $1"
        pass=$((pass + 1))
    else
        echo "  FAIL $1 (expected exit $2, got $3)"
        fail=$((fail + 1))
    fi
}

assert() {
    if [ "$2" = "yes" ]; then
        echo "  ok   $1"
        pass=$((pass + 1))
    else
        echo "  FAIL $1"
        fail=$((fail + 1))
    fi
}

installed() { [ -e "$DEST/chex" ] && echo yes || echo no; }
said() { grep -q "$1" "$WORK/out" && echo yes || echo no; }

# set -e would abort the command substitution before the exit code is echoed.
run() {
    set +e
    env "$@" sh "$WORK/install.sh" >"$WORK/out" 2>&1
    rc=$?
    set -e
    echo $rc
}

echo "install.sh fail-closed checks:"

check "matching checksum installs" 0 "$(run)"
assert "  binary is installed" "$(installed)"
assert "  verification is reported" "$(said 'Checksum verified')"
rm -f "$DEST/chex"

printf 'TAMPERED\n' > "$RELEASE/$ASSET"
check "tampered binary aborts" 1 "$(run)"
assert "  mismatch is reported" "$(said 'Checksum mismatch')"
assert "  nothing is installed" "$([ "$(installed)" = no ] && echo yes || echo no)"
printf 'genuine binary\n' > "$RELEASE/$ASSET"
sums

mv "$RELEASE/SHA256SUMS" "$RELEASE/SHA256SUMS.hidden"
check "unreachable SHA256SUMS aborts" 1 "$(run)"
assert "  nothing is installed" "$([ "$(installed)" = no ] && echo yes || echo no)"
mv "$RELEASE/SHA256SUMS.hidden" "$RELEASE/SHA256SUMS"

printf 'deadbeef  some-other-asset\n' > "$RELEASE/SHA256SUMS"
check "asset absent from SHA256SUMS aborts" 1 "$(run)"
assert "  nothing is installed" "$([ "$(installed)" = no ] && echo yes || echo no)"
sums

mv "$RELEASE/SHA256SUMS" "$RELEASE/SHA256SUMS.hidden"
check "CHEX_SKIP_CHECKSUM=1 installs" 0 "$(run CHEX_SKIP_CHECKSUM=1)"
assert "  the skip is warned about" "$(said 'skipping checksum verification')"
mv "$RELEASE/SHA256SUMS.hidden" "$RELEASE/SHA256SUMS"
rm -f "$DEST/chex"

# CHEX_VERSION is the rollback path: it must fetch the pinned tag, not latest.
pinned() { grep -q 'pinned binary' "$DEST/chex" && echo yes || echo no; }

check "CHEX_VERSION installs the pinned release" 0 "$(run CHEX_VERSION="$PINNED_TAG")"
assert "  the pinned binary is the one installed" "$(pinned)"
rm -f "$DEST/chex"

# A bare version is accepted; the leading "v" is supplied.
check "CHEX_VERSION without a leading v works" 0 "$(run CHEX_VERSION="${PINNED_TAG#v}")"
assert "  the pinned binary is the one installed" "$(pinned)"
rm -f "$DEST/chex"

check "unknown CHEX_VERSION aborts" 1 "$(run CHEX_VERSION=v0.0.00)"
assert "  nothing is installed" "$([ "$(installed)" = no ] && echo yes || echo no)"

echo "  ---"
echo "  $pass passed, $fail failed"
[ "$fail" -eq 0 ]
