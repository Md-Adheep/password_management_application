# Auto-Deploy Setup Guide

## How It Works

```
./deploy.sh "message"
    └─► git push to main ──► GitHub Actions ──► POST /deploy-webhook ──► Plesk ──► Live
```

Feature branches pushed to GitHub will NOT trigger any deployment.

---

## Step 1 — Generate a Deploy Secret

Run this on your local machine or server:
```bash
openssl rand -hex 32
```
Copy the output — this is your `DEPLOY_SECRET`. Keep it safe.

---

## Step 2 — Add Secret to GitHub

1. Go to: https://github.com/Md-Adheep/password_management_application/settings/secrets/actions
2. Click **New repository secret**
3. Name: `DEPLOY_SECRET`
4. Value: paste the secret from Step 1
5. Click **Add secret**

---

## Step 3 — Add Secret to Plesk Server

SSH into your server and add to the Flask app's `.env` file:

```bash
echo "DEPLOY_SECRET=your_secret_here" >> /var/www/vhosts/nextgen.codesen.com/httpdocs/flask/.env
```

Or add via **Plesk Panel → Domains → nextgen.codesen.com → Python → Environment Variables**.

---

## Step 4 — First Deploy

```bash
chmod +x deploy.sh feature.sh
./deploy.sh "setup auto-deploy pipeline"
```

This pushes to main → GitHub Actions runs → webhook fires → server updates automatically.

---

## Step 5 — Test the Webhook Manually

```bash
curl -X POST https://nextgen.codesen.com/deploy-webhook \
  -H "X-Deploy-Token: YOUR_DEPLOY_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"branch":"main","commit":"test123","pusher":"manual-test"}'
```

Expected response:
```json
{"success": true, "branch": "main", "commit": "test123", "files_copied": 20, "message": "Deployed 20 files successfully."}
```

---

## Daily Usage

### Small fixes / hotfixes → deploy directly:
```bash
./deploy.sh "fix: correct login redirect issue"
```

### New features → use feature branch:
```bash
./feature.sh start "add-export-feature"
# ... make changes ...
./feature.sh push "feat: add CSV export"
# ... test on GitHub preview ...
./feature.sh done   # merges to main → auto-deploys live
```

### Check deploy logs on server:
```bash
tail -f /var/www/vhosts/nextgen.codesen.com/httpdocs/flask/deploy.log
```

---

## File Reference

| File | Purpose |
|------|---------|
| `deploy.sh` | Direct deploy to main (hotfixes) |
| `feature.sh` | Feature branch workflow |
| `.github/workflows/deploy.yml` | GitHub Actions — triggers on main push |
| `flask/deploy_webhook.py` | Webhook receiver on Plesk server |
| `flask/deploy.log` | Auto-created deployment log |
| `.claude/commands/deploy.md` | `/deploy` slash command for Claude Code |
| `.claude/commands/feature.md` | `/feature` slash command for Claude Code |
