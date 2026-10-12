#!/usr/bin/env bash
# FTR.NAB.CMN-0005 R26: at its release the product is at most one minor behind the
# current @green-on-grey/ui-kit; a major behind is never allowed.
#   deploy/kit-lag.sh            compares the pinned version with the latest in the registry
#   deploy/kit-lag.sh <latest>   the same against a given version (tests)
set -euo pipefail
cd "$(dirname "$0")/.."
pinned=$(node -p 'require("./package.json").dependencies["@green-on-grey/ui-kit"]')
[[ $pinned =~ ^([0-9]+)\.([0-9]+)\.[0-9]+$ ]] || { echo "::error::версия ui-kit должна быть точной (X.Y.Z), а в package.json «$pinned»"; exit 1; }
pmaj=${BASH_REMATCH[1]} pmin=${BASH_REMATCH[2]}
latest=${1:-$(npm view @green-on-grey/ui-kit version)}
[[ $latest =~ ^([0-9]+)\.([0-9]+)\.[0-9]+$ ]] || { echo "::error::не удалось узнать последнюю версию ui-kit: «$latest»"; exit 1; }
lmaj=${BASH_REMATCH[1]} lmin=${BASH_REMATCH[2]}
if ((lmaj > pmaj)) || { ((lmaj == pmaj)) && ((lmin - pmin > 1)); }; then
  echo "::error::ui-kit $pinned отстаёт от $latest больше чем на один minor — обновите кит перед релизом (FTR.NAB.CMN-0005 R26)"
  exit 1
fi
echo "ui-kit $pinned, последняя $latest — в пределах одного minor."
