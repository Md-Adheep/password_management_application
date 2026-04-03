#!/bin/bash
set -e

# ─── Colors ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# ─── Check git repo ───────────────────────────────────────────────────────────
if [ ! -d ".git" ]; then
  echo -e "${RED}✗ Not a git repository. Run this from the project root.${NC}"
  exit 1
fi

# ─── Get GitHub Actions URL from remote ───────────────────────────────────────
REMOTE_URL=$(git remote get-url origin)
REPO_PATH=$(echo "$REMOTE_URL" | sed 's/.*github.com[:/]//' | sed 's/\.git$//')
ACTIONS_URL="https://github.com/${REPO_PATH}/actions"

# ─── Check current branch ─────────────────────────────────────────────────────
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  echo -e "${YELLOW}⚠  You are on branch '${BRANCH}'. Use ./feature.sh to work with feature branches.${NC}"
  read -p "Continue deploying from this branch? (y/N) " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}Aborted. Switch to main or use: ./feature.sh done${NC}"
    exit 0
  fi
fi

# ─── Check for changes ────────────────────────────────────────────────────────
CHANGED=$(git status --porcelain)
UNPUSHED=$(git log origin/main..HEAD --oneline 2>/dev/null || true)

if [ -z "$CHANGED" ] && [ -z "$UNPUSHED" ]; then
  echo -e "${YELLOW}⚠  Nothing to deploy — no uncommitted changes or unpushed commits.${NC}"
  exit 0
fi

# ─── Commit message ───────────────────────────────────────────────────────────
MSG="${1:-deploy: update $(date '+%Y-%m-%d %H:%M')}"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Deploying: ${MSG}${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# ─── Stage & commit ───────────────────────────────────────────────────────────
if [ -n "$CHANGED" ]; then
  echo -e "${YELLOW}Changed files:${NC}"
  git status --short
  echo ""
  git add .
  git commit -m "$MSG"
fi

# ─── Pull then push ───────────────────────────────────────────────────────────
echo -e "${BLUE}Pulling latest...${NC}"
git pull --rebase origin main

echo -e "${GREEN}Pushing to main...${NC}"
git push origin main

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}✓ Pushed to GitHub!${NC}"
echo -e "${BLUE}⏳ GitHub Actions is deploying to Plesk...${NC}"
echo -e "${BLUE}🔗 Monitor: ${ACTIONS_URL}${NC}"
echo -e "${GREEN}🌐 Live in ~30-60 seconds${NC}"
