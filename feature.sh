#!/bin/bash
set -e

# ─── Colors ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# ─── GitHub URLs ─────────────────────────────────────────────────────────────
REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
REPO_PATH=$(echo "$REMOTE_URL" | sed 's/.*github.com[:/]//' | sed 's/\.git$//')
ACTIONS_URL="https://github.com/${REPO_PATH}/actions"
GITHUB_URL="https://github.com/${REPO_PATH}"

COMMAND="${1:-}"
CURRENT_BRANCH=$(git branch --show-current)

case "$COMMAND" in

  # ─── start ─────────────────────────────────────────────────────────────────
  start)
    FEATURE_NAME="${2:-}"
    if [ -z "$FEATURE_NAME" ]; then
      echo -e "${RED}✗ Usage: ./feature.sh start \"feature-name\"${NC}"
      exit 1
    fi

    # Always start from an up-to-date main
    if [ "$CURRENT_BRANCH" != "main" ]; then
      echo -e "${YELLOW}Switching to main first...${NC}"
      git checkout main
    fi
    git pull origin main

    git checkout -b "feature/${FEATURE_NAME}"
    echo -e "${GREEN}✓ Now on branch feature/${FEATURE_NAME}${NC}"
    echo -e "${BLUE}  Make your changes, then run: ./feature.sh push${NC}"
    ;;

  # ─── push ──────────────────────────────────────────────────────────────────
  push)
    if [[ ! "$CURRENT_BRANCH" == feature/* ]]; then
      echo -e "${YELLOW}⚠  You're on '${CURRENT_BRANCH}', not a feature branch.${NC}"
      echo -e "${BLUE}   Use ./deploy.sh for direct deploys to main.${NC}"
      exit 1
    fi

    MSG="${2:-feat: update $(date '+%Y-%m-%d %H:%M')}"
    CHANGED=$(git status --porcelain)

    if [ -n "$CHANGED" ]; then
      git add .
      git commit -m "$MSG"
    else
      echo -e "${YELLOW}No changes to commit.${NC}"
    fi

    git push -u origin "$CURRENT_BRANCH"
    echo ""
    echo -e "${GREEN}✓ Pushed to GitHub (feature branch — NOT live yet)${NC}"
    echo -e "${BLUE}  When ready to go live, run: ./feature.sh done${NC}"
    echo -e "${BLUE}  Compare: ${GITHUB_URL}/compare/main...${CURRENT_BRANCH}${NC}"
    ;;

  # ─── done ──────────────────────────────────────────────────────────────────
  done)
    if [[ ! "$CURRENT_BRANCH" == feature/* ]]; then
      echo -e "${RED}✗ Not on a feature branch. Current: '${CURRENT_BRANCH}'${NC}"
      exit 1
    fi

    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  Commits in this branch vs main:${NC}"
    git log main..HEAD --oneline 2>/dev/null || echo "  (none)"
    echo ""
    echo -e "${BLUE}  Files changed:${NC}"
    git diff main --name-only 2>/dev/null || echo "  (none)"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    read -p "🚀 Merge to main and deploy live? (y/N) " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
      echo -e "${BLUE}Aborted. Branch kept as-is.${NC}"
      exit 0
    fi

    FEATURE_BRANCH="$CURRENT_BRANCH"
    git checkout main
    git pull origin main
    git merge --no-ff "$FEATURE_BRANCH" -m "merge: ${FEATURE_BRANCH} → main"
    git push origin main   # ← triggers GitHub Actions → Plesk → Live

    echo ""
    echo -e "${GREEN}✓ Merged & deployed! Live in ~30-60 seconds.${NC}"
    echo -e "${BLUE}🔗 Monitor: ${ACTIONS_URL}${NC}"

    read -p "Delete feature branch locally? (Y/n) " del_local
    if [[ ! "$del_local" =~ ^[Nn]$ ]]; then
      git branch -d "$FEATURE_BRANCH"
    fi

    read -p "Delete feature branch on GitHub? (y/N) " del_remote
    if [[ "$del_remote" =~ ^[Yy]$ ]]; then
      git push origin --delete "$FEATURE_BRANCH"
    fi
    ;;

  # ─── status ────────────────────────────────────────────────────────────────
  status)
    echo -e "${BLUE}Branch: ${CURRENT_BRANCH}${NC}"
    echo ""
    git status --short
    echo ""
    echo -e "${BLUE}Commits ahead of main:${NC}"
    git log main..HEAD --oneline 2>/dev/null || echo "  (none)"
    echo ""
    echo -e "${BLUE}Files changed vs main:${NC}"
    git diff main --stat 2>/dev/null || echo "  (none)"
    ;;

  # ─── list ──────────────────────────────────────────────────────────────────
  list)
    echo -e "${BLUE}Feature branches:${NC}"
    FOUND=0
    git branch | grep "feature/" | while IFS= read -r branch; do
      trimmed=$(echo "$branch" | xargs)
      FOUND=1
      if [ "$trimmed" == "$CURRENT_BRANCH" ]; then
        echo -e "  ${GREEN}* $trimmed (current)${NC}"
      else
        echo "    $trimmed"
      fi
    done
    if [ $FOUND -eq 0 ]; then
      echo "  (no feature branches)"
    fi
    ;;

  # ─── discard ───────────────────────────────────────────────────────────────
  discard)
    if [[ ! "$CURRENT_BRANCH" == feature/* ]]; then
      echo -e "${RED}✗ Not on a feature branch. Current: '${CURRENT_BRANCH}'${NC}"
      exit 1
    fi

    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}  This will permanently delete: ${CURRENT_BRANCH}${NC}"
    echo -e "${RED}  Commits to lose:${NC}"
    git log main..HEAD --oneline 2>/dev/null || echo "  (none)"
    echo -e "${RED}  Files to lose:${NC}"
    git diff main --name-only 2>/dev/null || echo "  (none)"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    read -p "⚠  Discard ALL changes and return to main? This cannot be undone. (y/N) " confirm
    if [[ "$confirm" =~ ^[Yy]$ ]]; then
      FEATURE_BRANCH="$CURRENT_BRANCH"
      git checkout main
      git branch -D "$FEATURE_BRANCH"
      echo -e "${GREEN}✓ Discarded. Back on main.${NC}"
    else
      echo -e "${BLUE}Aborted. No changes made.${NC}"
    fi
    ;;

  # ─── help ──────────────────────────────────────────────────────────────────
  *)
    echo -e "${BLUE}Usage:${NC}"
    echo "  ./feature.sh start \"feature-name\"   # Create + switch to feature branch"
    echo "  ./feature.sh push  \"commit msg\"      # Commit + push (NOT live yet)"
    echo "  ./feature.sh done                    # Merge to main → deploy live"
    echo "  ./feature.sh status                  # Show current state"
    echo "  ./feature.sh list                    # List all feature branches"
    echo "  ./feature.sh discard                 # Delete branch (irreversible)"
    ;;
esac
