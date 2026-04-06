#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# rollback.sh — CorpVault server-side rollback tool
#
# Run this directly on the Plesk server (via SSH or Plesk terminal):
#   bash /path/to/httpdocs/flask/rollback.sh
#
# What it does:
#   1. Lists all available releases in httpdocs/releases/
#   2. Shows which release is currently live
#   3. Lets you pick a release to restore
#   4. Copies that release over the live flask/ directory
#   5. Restarts Passenger via tmp/restart.txt
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ─── Paths ────────────────────────────────────────────────────────────────────
FLASK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # httpdocs/flask/
APP_ROOT="$(dirname "$FLASK_DIR")"                           # httpdocs/
RELEASES_DIR="$APP_ROOT/releases"
CURRENT_MARKER="$APP_ROOT/current_release"
RESTART_FILE="$FLASK_DIR/tmp/restart.txt"
HEALTH_URL="${HEALTH_CHECK_URL:-https://nextgen.codesen.com/health}"

PROTECTED=("deploy_webhook.py" ".env" "config.py" "deploy.log")

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

# ─── Helpers ──────────────────────────────────────────────────────────────────
log()  { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$FLASK_DIR/deploy.log"; }
info() { echo -e "${BLUE}$*${NC}"; }
ok()   { echo -e "${GREEN}✓ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠  $*${NC}"; }
err()  { echo -e "${RED}✗ $*${NC}"; }

is_protected() {
  local name="$1"
  for p in "${PROTECTED[@]}"; do [[ "$name" == "$p" ]] && return 0; done
  return 1
}

# ─── Banner ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${BLUE}  CorpVault — Rollback Tool${NC}"
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ─── Guard: releases directory must exist ─────────────────────────────────────
if [[ ! -d "$RELEASES_DIR" ]]; then
  err "Releases directory not found: $RELEASES_DIR"
  err "No deployments have been made yet."
  exit 1
fi

# ─── Load releases (newest first) ─────────────────────────────────────────────
mapfile -t RELEASES < <(ls -r "$RELEASES_DIR" 2>/dev/null)
if [[ ${#RELEASES[@]} -eq 0 ]]; then
  err "No releases found in $RELEASES_DIR"
  exit 1
fi

# ─── Current release ──────────────────────────────────────────────────────────
CURRENT=""
if [[ -f "$CURRENT_MARKER" ]]; then
  CURRENT="$(cat "$CURRENT_MARKER" | tr -d '[:space:]')"
fi

# ─── List releases ────────────────────────────────────────────────────────────
info "Available releases (newest → oldest):"
echo ""
for i in "${!RELEASES[@]}"; do
  r="${RELEASES[$i]}"
  num=$((i + 1))

  # Parse timestamp: 20240103_140000 → 2024-01-03 14:00:00
  if [[ "$r" =~ ^([0-9]{4})([0-9]{2})([0-9]{2})_([0-9]{2})([0-9]{2})([0-9]{2})$ ]]; then
    pretty="${BASH_REMATCH[1]}-${BASH_REMATCH[2]}-${BASH_REMATCH[3]}  ${BASH_REMATCH[4]}:${BASH_REMATCH[5]}:${BASH_REMATCH[6]}"
  else
    pretty="$r"
  fi

  if [[ "$r" == "$CURRENT" ]]; then
    echo -e "  ${YELLOW}[$num]${NC}  $pretty  ${GREEN}← live${NC}"
  else
    echo -e "  ${CYAN}[$num]${NC}  $pretty"
  fi
done
echo ""

# ─── Prompt ───────────────────────────────────────────────────────────────────
read -rp "Select release number to restore (or 'q' to quit): " CHOICE

[[ "$CHOICE" == "q" || "$CHOICE" == "Q" ]] && { echo "Aborted."; exit 0; }

if ! [[ "$CHOICE" =~ ^[0-9]+$ ]] || (( CHOICE < 1 || CHOICE > ${#RELEASES[@]} )); then
  err "Invalid selection: $CHOICE"
  exit 1
fi

TARGET="${RELEASES[$((CHOICE - 1))]}"

if [[ "$TARGET" == "$CURRENT" ]]; then
  warn "Release '$TARGET' is already live. Nothing to do."
  exit 0
fi

RELEASE_DIR="$RELEASES_DIR/$TARGET"
if [[ ! -d "$RELEASE_DIR" ]]; then
  err "Release directory not found: $RELEASE_DIR"
  exit 1
fi

# ─── Confirm ──────────────────────────────────────────────────────────────────
echo ""
echo -e "  Current : ${RED}${CURRENT:-none}${NC}"
echo -e "  Restore : ${GREEN}${TARGET}${NC}"
echo ""
read -rp "Confirm rollback? (y/N): " CONFIRM

if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

# ─── Copy files ───────────────────────────────────────────────────────────────
echo ""
log "[ROLLBACK START] Restoring release: $TARGET"

count=0
while IFS= read -r -d '' file; do
  relative="${file#"$RELEASE_DIR"/}"
  filename="$(basename "$file")"

  # Skip protected files
  is_protected "$filename" && continue

  # Skip __pycache__
  [[ "$file" == *"__pycache__"* ]] && continue

  dest="$FLASK_DIR/$relative"
  mkdir -p "$(dirname "$dest")"
  cp -f "$file" "$dest"
  ((count++)) || true
done < <(find "$RELEASE_DIR" -type f -print0)

log "[ROLLBACK] $count files restored from $TARGET"

# ─── Update current marker ────────────────────────────────────────────────────
echo "$TARGET" > "$CURRENT_MARKER"

# ─── Restart Passenger ───────────────────────────────────────────────────────
mkdir -p "$(dirname "$RESTART_FILE")"
touch "$RESTART_FILE"
log "[RESTART] Touched $RESTART_FILE"

# ─── Health check ────────────────────────────────────────────────────────────
echo ""
info "Waiting 8s for app to restart..."
sleep 8

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$HEALTH_URL" 2>/dev/null || echo "000")
if [[ "$HTTP_STATUS" == "200" ]]; then
  ok "Health check passed (HTTP $HTTP_STATUS)"
else
  warn "Health check returned HTTP $HTTP_STATUS — app may still be restarting"
  warn "Check manually: curl $HEALTH_URL"
fi

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
ok "Rollback complete — now running: $TARGET"
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
log "[ROLLBACK DONE] Active release: $TARGET"
