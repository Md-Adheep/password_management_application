# CorpVault — Project Architecture & DevOps Flow

**Stack:** Python 3.9 · Flask · MySQL · Passenger WSGI · Plesk · GitHub Actions  
**Live:** https://nextgen.codesen.com  
**Repo:** https://github.com/Md-Adheep/password_management_application

---

## 1. Repository Structure

```
password_management_application/          ← repo root
│
├── deploy.sh                             ← local CLI: direct deploy to main
├── feature.sh                            ← local CLI: feature branch lifecycle
├── DEPLOY_SETUP.md                       ← one-time setup guide
├── PROJECT_FLOW.md                       ← this file
│
├── .github/
│   └── workflows/
│       └── deploy.yml                    ← GitHub Actions: POST webhook on main push
│
├── .claude/
│   └── commands/
│       ├── deploy.md                     ← /deploy slash command (Claude Code)
│       └── feature.md                    ← /feature slash command (Claude Code)
│
└── flask/                                ← application root (Passenger entry point)
    ├── app.py                            ← Flask app factory + blueprint registration
    ├── config.py                         ← env-based config (DB, JWT, encryption key)
    ├── extensions.py                     ← SQLAlchemy, Bcrypt, JWTManager, CORS
    ├── models.py                         ← ORM: User, PasswordEntry
    ├── requirements.txt                  ← pip dependencies
    ├── passenger_wsgi.py                 ← Passenger entry: loads .env, calls create_app()
    ├── deploy_webhook.py                 ← Flask Blueprint: webhook receiver for auto-deploy
    │
    ├── routes/
    │   ├── __init__.py
    │   ├── auth.py                       ← /api/auth/* (login, me, change-password)
    │   ├── passwords.py                  ← /api/passwords/* (CRUD, decrypt, generate)
    │   └── admin.py                      ← /api/admin/* (user management, stats)
    │
    ├── utils/
    │   ├── encryption.py                 ← Fernet symmetric encryption (ENCRYPTION_KEY)
    │   └── password_generator.py         ← random password generator
    │
    └── frontend/                         ← static SPA (served by Flask)
        ├── login.html
        ├── dashboard.html
        ├── admin.html
        ├── css/style.css
        └── js/
            ├── auth.js
            ├── dashboard.js
            └── admin.js
```

---

## 2. Infrastructure Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Developer Machine                                                   │
│                                                                      │
│   ./deploy.sh "msg"          ./feature.sh done                      │
│         │                           │                                │
│         └──────────┬────────────────┘                               │
│                    ▼                                                 │
│             git push origin main                                     │
└────────────────────┬────────────────────────────────────────────────┘
                     │ push event (main branch only)
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│  GitHub                                                              │
│                                                                      │
│   Repository: Md-Adheep/password_management_application             │
│   Secret:     DEPLOY_SECRET (used as X-Deploy-Token header)         │
│                                                                      │
│   GitHub Actions (.github/workflows/deploy.yml)                     │
│   ├── Trigger: push to main ONLY                                    │
│   └── Action:  POST https://nextgen.codesen.com/deploy-webhook      │
│                  Header: X-Deploy-Token: $DEPLOY_SECRET             │
│                  Body:   { branch, commit, pusher }                 │
└────────────────────┬────────────────────────────────────────────────┘
                     │ HTTP POST /deploy-webhook
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Plesk Server — nextgen.codesen.com                                  │
│                                                                      │
│   Passenger WSGI                                                     │
│   └── passenger_wsgi.py                                             │
│       ├── loads flask/.env                                          │
│       └── calls create_app() → Flask app                            │
│                                                                      │
│   Flask App (flask/app.py)                                          │
│   ├── /deploy-webhook  ← deploy_webhook_bp (Blueprint)              │
│   ├── /api/auth/*      ← auth_bp                                    │
│   ├── /api/passwords/* ← passwords_bp                               │
│   ├── /api/admin/*     ← admin_bp                                   │
│   └── /*               ← static frontend (GET only)                 │
│                                                                      │
│   deploy_webhook.py (on POST /deploy-webhook):                      │
│   ├── 1. Validate X-Deploy-Token (hmac.compare_digest)              │
│   ├── 2. Download main.zip from GitHub                              │
│   ├── 3. Extract → copy files to httpdocs/flask/ (skip protected)  │
│   ├── 4. pip install -r requirements.txt                            │
│   ├── 5. touch flask/tmp/restart.txt → Passenger restart            │
│   └── 6. Return { success, files_copied, commit }                  │
│                                                                      │
│   Database: MySQL                                                    │
│   ├── Table: users         (id, username, email, role, is_active)   │
│   └── Table: password_entries (id, user_id, encrypted_password...)  │
│                                                                      │
│   File system:                                                       │
│   /var/www/vhosts/nextgen.codesen.com/httpdocs/                     │
│   ├── flask/                 ← live application                     │
│   ├── flask/.env             ← secrets (never in git)               │
│   ├── flask/deploy.log       ← auto-deploy audit log                │
│   └── flask/tmp/restart.txt  ← Passenger restart trigger            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Git Branching Strategy

```
main ──────────────────────────────────────────────────────────► (protected)
  │                                                      ▲
  │   git checkout -b feature/xyz                        │
  ├──► feature/xyz ──────────────────────────────────────┤ merge --no-ff
  │         │                                            │
  │    (develop, ./feature.sh push)              ./feature.sh done
  │    pushed to GitHub, NOT deployed                    │
  │                                                      │
  └──► hotfix via ./deploy.sh ──────────────────────────►┘ (direct push)
```

**Rule:** GitHub Actions deploys **ONLY** when code reaches `main`.  
Feature branch pushes → GitHub only, zero server impact.

---

## 4. CI/CD Pipeline — Step by Step

```
Developer                GitHub                  Plesk Server
────────                 ──────                  ────────────
./deploy.sh "msg"
  │
  ├─ git add .
  ├─ git commit
  ├─ git pull --rebase
  └─ git push origin main ──────────────────────►
                          push event (main)
                          GitHub Actions starts
                                │
                          deploy.yml runs
                          curl POST /deploy-webhook
                          X-Deploy-Token: $SECRET ──────────────►
                                                   deploy_webhook.py
                                                   ├─ validate token
                                                   ├─ download ZIP
                                                   ├─ extract files
                                                   ├─ copy to live dir
                                                   ├─ pip install
                                                   ├─ touch restart.txt
                                                   └─ return 200 OK
                          ◄─────────────────────── HTTP 200
                          Actions: ✓ success
```

**Total time: ~30–60 seconds from `git push` to live.**

---

## 5. Application Layer

### 5.1 Request Flow

```
Browser
  │
  ├─ GET  /                    → login.html (static)
  ├─ GET  /dashboard.html      → dashboard.html (static)
  ├─ GET  /admin.html          → admin.html (static)
  │
  ├─ POST /api/auth/login      → auth.py → JWT token issued
  ├─ GET  /api/auth/me         → auth.py → current user info
  │
  ├─ GET  /api/passwords/      → passwords.py → list (encrypted at rest)
  ├─ POST /api/passwords/      → passwords.py → create (Fernet encrypt)
  ├─ GET  /api/passwords/:id/decrypt → passwords.py → Fernet decrypt
  │
  ├─ GET  /api/admin/users     → admin.py → all users (admin only)
  ├─ POST /api/admin/users     → admin.py → create user
  └─ POST /deploy-webhook      → deploy_webhook.py → auto-deploy
```

### 5.2 Authentication Flow

```
Login (POST /api/auth/login)
  │
  ├─ Validate username + password (bcrypt)
  ├─ Check is_active flag
  ├─ Update last_login timestamp
  └─ Return JWT { identity: {id, role}, exp: 1hr }
       │
       ▼
  Client stores: localStorage { token, user }
       │
       ▼
  All API calls → Authorization: Bearer <token>
       │
       ▼
  @jwt_required() / admin_required() decorator validates token
```

### 5.3 Password Encryption

```
Store:   plain_text ──► Fernet(ENCRYPTION_KEY).encrypt() ──► DB (encrypted)
Retrieve: DB (encrypted) ──► Fernet(ENCRYPTION_KEY).decrypt() ──► plain_text
```

`ENCRYPTION_KEY` is a Fernet key stored in `.env`. **Never rotated without re-encrypting all entries.**

---

## 6. Environment Variables (.env)

```bash
# flask/.env — never committed to git

SECRET_KEY=<flask secret>
JWT_SECRET_KEY=<jwt signing secret>

DB_HOST=localhost
DB_PORT=3306
DB_NAME=password_manager
DB_USER=<db user>
DB_PASSWORD=<db password>

ENCRYPTION_KEY=<fernet key — generate once: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())">

DEPLOY_SECRET=<same value as GitHub Actions secret>
```

---

## 7. Security Model

| Layer | Mechanism |
|-------|-----------|
| Auth | JWT (HS256), 1hr expiry, role in claims |
| Passwords at rest | Fernet (AES-128-CBC + HMAC-SHA256) |
| Admin routes | `admin_required()` decorator, role check |
| Webhook | `hmac.compare_digest()` timing-safe token compare |
| Secrets | `.env` file, never in git (`.gitignore` enforced) |
| DB | PyMySQL, SQLAlchemy ORM (no raw queries) |

---

## 8. Developer Workflow Reference

### Hotfix / Small change:
```bash
# edit files
./deploy.sh "fix: description"
# → auto-deploys to live in ~60s
```

### New Feature:
```bash
./feature.sh start "feature-name"     # branch: feature/feature-name
# edit files
./feature.sh push "feat: description" # push to GitHub, NOT live
./feature.sh push "feat: more work"   # keep pushing as needed
./feature.sh done                     # merge → main → auto-deploy live
```

### Ops Commands:
```bash
# Check deploy log on server
tail -f /var/www/vhosts/nextgen.codesen.com/httpdocs/flask/deploy.log

# Manual server restart
sudo touch /var/www/vhosts/nextgen.codesen.com/httpdocs/flask/tmp/restart.txt

# Manual webhook test
curl -X POST https://nextgen.codesen.com/deploy-webhook \
  -H "X-Deploy-Token: $DEPLOY_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"branch":"main","commit":"manual","pusher":"ops"}'

# Check GitHub Actions
open https://github.com/Md-Adheep/password_management_application/actions
```

---

## 9. Protected Files (Never Overwritten by Auto-Deploy)

| File | Reason |
|------|--------|
| `flask/.env` | Secrets — server-specific |
| `flask/config.py` | May have server overrides |
| `flask/deploy_webhook.py` | Can't overwrite the running receiver |
| `flask/deploy.log` | Audit log — must persist |

---

## 10. Rollback Procedure

```bash
# Find last good commit
git log --oneline

# Revert to that commit
git revert <bad-commit-hash>
./deploy.sh "revert: rollback to stable"
# → auto-deploys reverted version
```

Or hard rollback:
```bash
git reset --hard <good-commit-hash>
git push origin main --force   # ⚠ confirm with team first
```
