#!/bin/sh
# Release check: runs the upstream overlap test, which the ordinary test run skips.
#
#   CLEARING_UPSTREAM=<folder with the upstream Compound Writing files> scripts/release-check.sh
#
# Fails loudly if CLEARING_UPSTREAM is missing or names a folder that isn't there, and fails if the
# test reports anything but a pass (a skip counts as a failure here). Then runs the whole suite with
# the variable set. Run it on the commit you are about to release. See docs/RELEASE.md.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

fail() {
  echo "" >&2
  echo "RELEASE CHECK FAILED: $1" >&2
  echo "" >&2
  exit 1
}

[ -n "${CLEARING_UPSTREAM:-}" ] || fail "CLEARING_UPSTREAM is not set. Point it at the folder with the upstream Compound Writing files, for example:
  CLEARING_UPSTREAM=/path/to/compound-writing-source scripts/release-check.sh"
[ -d "$CLEARING_UPSTREAM" ] || fail "CLEARING_UPSTREAM is $CLEARING_UPSTREAM, which is not a folder on this computer."
export CLEARING_UPSTREAM

cd "$ROOT/tests"
OUT=$(/usr/bin/python3 -m unittest -v test_release.ReleaseTest.test_no_upstream_text_is_shipped 2>&1) || {
  echo "$OUT" >&2
  fail "the upstream overlap test found shipped text that matches the upstream files (or could not run)."
}
echo "$OUT" | grep -q "test_no_upstream_text_is_shipped .* \.\.\. ok$" || {
  echo "$OUT" >&2
  fail "the upstream overlap test did not pass (it was skipped or did not run)."
}
echo "Upstream overlap test: passed against $CLEARING_UPSTREAM"

/usr/bin/python3 -m unittest || fail "the test suite has failures."
echo "Release check passed."
