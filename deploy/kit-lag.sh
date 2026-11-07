#!/usr/bin/env bash
# FTR.NAB.CMN-0005 R26: at its release the product is at most one minor behind the
# current @green-on-grey/ui-kit; a major behind is never allowed.
# NAB-06 (FTR.NAB.CMN-0005 qa, R25): the version of the kit in package.json is exact, without ^ or ~.
#   deploy/kit-lag.sh            compares the pinned version with the latest in the registry
#   deploy/kit-lag.sh <latest>   the same against a given version (tests)
set -euo pipefail
cd "$(dirname "$0")/.."
pinned=$(node -p 'require("./package.json").dependencies["@green-on-grey/ui-kit"]')
[[ $pinned =~ ^([0-9]+)\.([0-9]+)\.[0-9]+$ ]] || { echo "::error::the version of ui-kit must be exact (X.Y.Z), and package.json has '$pinned'"; exit 1; }
pmaj=${BASH_REMATCH[1]} pmin=${BASH_REMATCH[2]}
latest=${1:-$(npm view @green-on-grey/ui-kit version)}
[[ $latest =~ ^([0-9]+)\.([0-9]+)\.[0-9]+$ ]] || { echo "::error::failed to find the latest version of ui-kit: '$latest'"; exit 1; }
lmaj=${BASH_REMATCH[1]} lmin=${BASH_REMATCH[2]}
if ((lmaj > pmaj)) || { ((lmaj == pmaj)) && ((lmin - pmin > 1)); }; then
  echo "::error::ui-kit $pinned is behind $latest by more than one minor: update the kit before a release (FTR.NAB.CMN-0005 R26)"
  exit 1
fi
echo "ui-kit $pinned, latest $latest: within one minor."
