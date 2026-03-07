#!/bin/bash
# push-to-vps.sh — copy and run fresh-vps-install.sh on a remote VPS.
# Usage:
#   ./scripts/push-to-vps.sh root@delerium.cc
#   ./scripts/push-to-vps.sh root@delerium.cc ~/.ssh/id_ed25519
#   WIPE_DATA=1 ./scripts/push-to-vps.sh root@delerium.cc ~/.ssh/id_ed25519

set -euo pipefail

VPS="${1:-}"
SSH_KEY="${2:-}"
WIPE_DATA="${WIPE_DATA:-0}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALLER="$SCRIPT_DIR/fresh-vps-install.sh"

[[ -n "$VPS" ]] || { echo "Usage: $0 user@host [~/.ssh/key]"; exit 1; }
[[ -f "$INSTALLER" ]] || { echo "Installer not found: $INSTALLER"; exit 1; }

SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
[[ -n "$SSH_KEY" ]] && SSH_OPTS+=(-o IdentitiesOnly=yes -i "$SSH_KEY")

echo "→ Copying installer to $VPS..."
scp "${SSH_OPTS[@]}" "$INSTALLER" "$VPS":/tmp/fresh-vps-install.sh

echo "→ Running installer on $VPS..."
ssh "${SSH_OPTS[@]}" "$VPS" "WIPE_DATA=$WIPE_DATA sudo -E bash /tmp/fresh-vps-install.sh"
