# CorpVault — Project Architecture & DevOps Flow

**Stack:** Python 3.9 · Flask · MySQL · SQLAlchemy · Passenger WSGI · Plesk · GitHub Actions  
**Live:** https://nextgen.codesen.com  
**Repo:** https://github.com/Md-Adheep/password_management_application

---

## 1. Repository Structure

```
password_management_application/              ← repo root
│
├── deploy.sh                                 ← local CLI: hotfix / direct deploy to main
├── feature.sh                                ← local CLI: feature branch lifecycle
├── PROJECT_FLOW.md                           ← this file
│
├── .github/
│   └── workflows/
│       └── deploy.yml                        ← GitHub Actions: curl POST webhook on main push
│
└── flask/                                    ← application root (Passenger entry point)
    ├── app.py                                ← Flask app factory, blueprint registration, migrations
    ├── config.py                             ← env-based config  [PROTECTED]
    ├── extensions.py                         ← db, bcrypt, jwt, cors instances
    ├── models.py                             ← ORM: User, PasswordEntry, Group, GroupMember, GroupPassword
    ├── requirements.txt                      ← pip dependencies
    ├── passenger_wsgi.py                     ← Passenger entry: loads .env, calls create_app()
    ├── deploy_webhook.py                     ← auto-deploy webhook receiver  [PROTECTED]
    ├── rollback.sh                           ← interactive rollback tool (run on server)
    ├── deploy.log                            ← deploy audit log  [PROTECTED]
    ├── .env                                  ← secrets  [PROTECTED — never in git]
    │
    ├── routes/
    │   ├── auth.py                           ← /api/auth/*
    │   ├── passwords.py                      ← /api/passwords/*
    │   ├── admin.py                          ← /api/admin/*
    │   └── groups.py                         ← /api/groups/*
    │
    ├── utils/
    │   ├── encryption.py                     ← Fernet symmetric encryption
    │   └── password_generator.py             ← random password generator
    │
    └── frontend/                             ← static SPA (served by Flask)
        ├── login.html
        ├── dashboard.html
        ├── admin.html
        ├── teams.html
        ├── css/style.css
        └── js/
            ├── auth.js
            ├── dashboard.js
            ├── admin.js
            └── teams.js
```

---

## 2. Database Schema

```
users
├── id            INT PK AUTO_INCREMENT
├── username      VARCHAR(80)  UNIQUE NOT NULL
├── email         VARCHAR(120) UNIQUE NOT NULL
├── password_hash VARCHAR(255) NOT NULL          ← bcrypt hash
├── role          ENUM('user','admin')
├── is_active     BOOLEAN DEFAULT TRUE
├── last_login    DATETIME
└── created_at    DATETIME

password_entries
├── id                 INT PK AUTO_INCREMENT
├── user_id            INT FK → users.id
├── title              VARCHAR(150) NOT NULL
├── username           VARCHAR(150)
├── encrypted_password TEXT NOT NULL              ← Fernet encrypted
├── url                VARCHAR(500)
├── notes              TEXT
├── category           VARCHAR(80) DEFAULT 'General'
├── is_favorite        BOOLEAN DEFAULT FALSE
├── created_at         DATETIME
└── updated_at         DATETIME (auto-update)

groups
├── id          INT PK AUTO_INCREMENT
├── name        VARCHAR(100) UNIQUE NOT NULL
├── description TEXT
├── created_by  INT FK → users.id
└── created_at  DATETIME

group_members
├── id        INT PK AUTO_INCREMENT
├── group_id  INT FK → groups.id
├── user_id   INT FK → users.id
├── role      ENUM('member','manager') DEFAULT 'member'
└── joined_at DATETIME
[UNIQUE: group_id + user_id]

group_passwords
├── id                 INT PK AUTO_INCREMENT
├── group_id           INT FK → groups.id
├── added_by           INT FK → users.id
├── title              VARCHAR(150) NOT NULL
├── username           VARCHAR(150)
├── encrypted_password TEXT NOT NULL
├── url                VARCHAR(500)
├── notes              TEXT
├── category           VARCHAR(80) DEFAULT 'General'
├── created_at         DATETIME
└── updated_at         DATETIME
```

> `db.create_all()` + `_migrate_columns()` auto-creates/alters tables on every app startup.  
> No Flask-Migrate needed for simple column additions.

---

## 3. API Endpoints

### Auth  `/api/auth`
| Method | Path | Description |
|--------|------|-------------|
| POST | `/login` | Issue JWT token (identity = str(user.id), claims = {role}) |
| GET  | `/me` | Current user info |
| PUT  | `/change-password` | Change own password |

### Passwords  `/api/passwords`
| Method | Path | Description |
|--------|------|-------------|
| GET  | `/` | List own passwords (search, category filter) |
| POST | `/` | Create password (Fernet encrypted) |
| PUT  | `/<id>` | Update password / toggle is_favorite |
| DELETE | `/<id>` | Delete password |
| GET  | `/<id>/decrypt` | Decrypt and return plaintext |
| GET  | `/generate` | Generate random password |
| GET  | `/categories` | List own categories |
| GET  | `/export` | Export all to CSV (decrypted) |
| POST | `/import` | Import from CSV (generic or Bitwarden format) |

### Admin  `/api/admin`  ← admin role only
| Method | Path | Description |
|--------|------|-------------|
| GET  | `/users` | List all users |
| POST | `/users` | Create user |
| PUT  | `/users/<id>` | Update user (role, active, password) |
| DELETE | `/users/<id>` | Delete user |
| GET  | `/stats` | Dashboard stats |
| GET  | `/all-passwords` | All passwords from all users (filter: user_id, category, search) |
| GET  | `/all-passwords/<id>/decrypt` | Decrypt any user's password |
| DELETE | `/all-passwords/<id>` | Delete any user's password |

### Groups  `/api/groups`
| Method | Path | Description |
|--------|------|-------------|
| GET  | `/` | List groups (admin: all, user: own groups) |
| POST | `/` | Create group (admin only) |
| PUT  | `/<id>` | Update group (admin / manager) |
| DELETE | `/<id>` | Delete group (admin only) |
| GET  | `/<id>/members` | List members |
| POST | `/<id>/members` | Add member (admin / manager) |
| DELETE | `/<id>/members/<user_id>` | Remove member |
| GET  | `/<id>/passwords` | List group passwords |
| POST | `/<id>/passwords` | Add group password |
| GET  | `/<id>/passwords/<id>/decrypt` | Decrypt group password |
| DELETE | `/<id>/passwords/<id>` | Delete group password |

### System
| Method | Path | Description |
|--------|------|-------------|
| GET  | `/health` | Health check → `{"status":"ok"}` 200 |
| POST | `/deploy-webhook` | Auto-deploy trigger (X-Deploy-Token required) |
| POST | `/rollback-api` | API rollback to previous/specific release |

---

## 4. Authentication & Authorization

```
POST /api/auth/login
  ├─ bcrypt.check_password_hash(user.password_hash, input)
  ├─ check user.is_active
  ├─ update user.last_login
  └─ create_access_token(
         identity = str(user.id),           ← must be string (JWT-Extended v4+)
         additional_claims = {'role': role}
     )

Every protected route:
  @jwt_required()
  user_id = int(get_jwt_identity())         ← get user id
  role    = get_jwt().get('role')           ← get role from claims

Admin routes use admin_required() decorator:
  verify_jwt_in_request()
  claims = get_jwt()
  if claims.get('role') != 'admin' → 403

Group access:
  admin     → full access to all groups
  manager   → add/remove members, add passwords
  member    → view and add passwords
  non-member → 403 Access Denied
```

---

## 5. Frontend Pages

| Page | File | Who Can Access |
|------|------|----------------|
| Login | `login.html` + `auth.js` | Everyone |
| Dashboard | `dashboard.html` + `dashboard.js` | Logged-in users |
| Admin Panel | `admin.html` + `admin.js` | Admin only |
| Teams | `teams.html` + `teams.js` | All logged-in users |

### Dashboard Features
- Add / Edit / Delete personal passwords
- Decrypt & copy passwords
- Search by title, username, **URL**
- Filter by category
- ⭐ Favorites (star/unstar, filter view)
- Password Generator (length, uppercase, digits, symbols)
- Export to CSV (all passwords, decrypted)
- Import from CSV (generic) or Bitwarden CSV
- 🌙 Dark Mode toggle (persisted in localStorage)

### Admin Panel Tabs
1. **Users** — Create, edit, deactivate, delete users
2. **Teams** — Create, edit, delete groups
3. **All Passwords** — View every password from every user account, decrypt, delete, filter by user/category/search

### Teams Page
- View groups you belong to (admin sees all)
- Group detail: Passwords tab + Members tab
- Add/remove members (admin or manager)
- Add/view/delete group passwords
- Shared vault per team/department

---

## 6. Infrastructure Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Developer Machine                                                    │
│                                                                       │
│   ./deploy.sh "msg"          ./feature.sh done                       │
│         │                           │                                 │
│         └──────────┬────────────────┘                                │
│                    ▼                                                  │
│             git push origin main                                      │
└────────────────────┬─────────────────────────────────────────────────┘
                     │ push event (main branch only)
                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│  GitHub                                                               │
│                                                                       │
│   Repo:   Md-Adheep/password_management_application                  │
│   Secret: DEPLOY_SECRET (→ X-Deploy-Token header)                    │
│                                                                       │
│   GitHub Actions (.github/workflows/deploy.yml)                      │
│   ├── Trigger: push to main ONLY                                     │
│   ├── curl --max-time 30 POST /deploy-webhook                        │
│   └── Expects HTTP 200 (webhook returns 200 immediately)             │
└────────────────────┬─────────────────────────────────────────────────┘
                     │ HTTP POST /deploy-webhook
                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Plesk Server — nextgen.codesen.com                                   │
│                                                                       │
│   Passenger WSGI → passenger_wsgi.py → create_app()                 │
│                                                                       │
│   Flask routes:                                                       │
│   ├── /health             → {"status":"ok"}                          │
│   ├── /deploy-webhook     → deploy_webhook_bp                        │
│   ├── /api/auth/*         → auth_bp                                  │
│   ├── /api/passwords/*    → passwords_bp                             │
│   ├── /api/admin/*        → admin_bp                                 │
│   ├── /api/groups/*       → groups_bp                                │
│   └── /*  (GET only)      → static frontend files                    │
│                                                                       │
│   File system:                                                        │
│   /var/www/vhosts/nextgen.codesen.com/httpdocs/                      │
│   ├── flask/              ← live app (Passenger serves from here)    │
│   ├── releases/           ← deployment history (last 5 kept)         │
│   │   ├── 20250401_100000/                                           │
│   │   ├── 20250402_143000/                                           │
│   │   └── 20250403_092000/  ← current                               │
│   └── current_release    ← text file: "20250403_092000"              │
│                                                                       │
│   MySQL Database                                                      │
│   └── Tables: users, password_entries, groups,                       │
│               group_members, group_passwords                          │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 7. CI/CD Pipeline — Step by Step

```
Developer                   GitHub Actions              Plesk Server
─────────                   ──────────────              ────────────
./deploy.sh "msg"
  ├─ git add .
  ├─ git commit
  ├─ git pull --rebase
  └─ git push origin main ──────────────────►
                            push event (main)
                            deploy.yml triggers
                            curl POST /deploy-webhook
                            --max-time 30 ─────────────────────────►
                                                        validate token (hmac)
                                                        return 200 immediately ◄─
                            ✓ Actions success
                                                        [background thread]
                                                        download repo ZIP
                                                        extract → releases/<ts>/
                                                        pip install
                                                        sync → flask/
                                                        update current_release
                                                        touch restart.txt
                                                        wait 8s
                                                        GET /health → 200?
                                                        ├─ YES → cleanup old releases ✓
                                                        └─ NO  → auto-rollback ⚡
```

**Total time: ~30s for GitHub Actions ✓ + ~2–3 min for background deploy to complete.**

---

## 8. Releases & Rollback System

### Directory Structure
```
httpdocs/
├── flask/                    ← live app
├── releases/
│   ├── 20250401_100000/      ← old release
│   ├── 20250402_143000/      ← old release
│   └── 20250403_092000/      ← current release
└── current_release           ← "20250403_092000"
```

### Auto-Rollback Flow
```
New deploy → health check fails
     ↓
previous_release = read current_release before deploy
     ↓
sync releases/<previous>/ → flask/
     ↓
update current_release → previous
     ↓
touch restart.txt
     ↓
Production restored automatically ✓
```

### Manual Rollback (on server)
```bash
bash /var/www/vhosts/nextgen.codesen.com/httpdocs/flask/rollback.sh
```
```
Available releases (newest → oldest):
  [1]  2025-04-03  09:20:00  ← live
  [2]  2025-04-02  14:30:00
  [3]  2025-04-01  10:00:00

Select release number to restore: 2
Confirm rollback? (y/N): y
✓ Rollback complete — now running: 20250402_143000
```

### API Rollback (with curl)
```bash
# Roll back to previous release
curl -X POST https://nextgen.codesen.com/rollback-api \
  -H "X-Deploy-Token: $DEPLOY_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'

# Roll back to specific release
curl -X POST https://nextgen.codesen.com/rollback-api \
  -H "X-Deploy-Token: $DEPLOY_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"release":"20250401_100000"}'
```

### Cleanup Policy
- Last **5 releases** kept automatically
- Older releases deleted after every successful deploy
- Current release is **never deleted**

---

## 9. Git Branching Strategy

```
main ─────────────────────────────────────────────────────────► (live)
  │                                                     ▲
  │  ./feature.sh start "name"                          │
  ├──► feature/name ───────────────────────────────────►│ feature.sh done
  │         │                                           │  (merge + deploy)
  │    feature.sh push (GitHub only, not live)          │
  │                                                     │
  └──► hotfix: ./deploy.sh "msg" ──────────────────────►┘ (direct to main)
```

**Rule:** GitHub Actions triggers **ONLY** on `main` branch pushes.  
Feature branch pushes → GitHub only, zero server impact.

---

## 10. Developer Workflow Reference

### Hotfix / Small Fix
```bash
# Edit file(s)
./deploy.sh "fix: description"
# Commits, pushes to main, auto-deploys in ~60s
```

### New Feature
```bash
./feature.sh start "feature-name"        # Creates feature/feature-name branch
# Edit files
./feature.sh push "feat: description"    # Push to GitHub (NOT live)
./feature.sh push "feat: more work"      # Push more commits as needed
./feature.sh done                        # Merge → main → auto-deploy live
```

### Other feature.sh Commands
```bash
./feature.sh status      # Show current branch + uncommitted changes
./feature.sh list        # List all feature branches
./feature.sh discard     # Abandon feature, return to main
```

---

## 11. Ops & Server Commands

```bash
# ── Watch deploy log live ──────────────────────────────────────────────
tail -f /var/www/vhosts/nextgen.codesen.com/httpdocs/flask/deploy.log

# ── Manual app restart ────────────────────────────────────────────────
touch /var/www/vhosts/nextgen.codesen.com/httpdocs/flask/tmp/restart.txt

# ── Health check ──────────────────────────────────────────────────────
curl https://nextgen.codesen.com/health

# ── Trigger deploy manually ───────────────────────────────────────────
curl -X POST https://nextgen.codesen.com/deploy-webhook \
  -H "X-Deploy-Token: $DEPLOY_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"branch":"main","commit":"manual","pusher":"ops"}'

# ── Rollback (interactive) ────────────────────────────────────────────
bash /var/www/vhosts/nextgen.codesen.com/httpdocs/flask/rollback.sh

# ── List available releases ───────────────────────────────────────────
ls -lt /var/www/vhosts/nextgen.codesen.com/httpdocs/releases/

# ── Check current release ─────────────────────────────────────────────
cat /var/www/vhosts/nextgen.codesen.com/httpdocs/current_release

# ── GitHub Actions status ─────────────────────────────────────────────
# https://github.com/Md-Adheep/password_management_application/actions
```

---

## 12. Security Model

| Layer | Mechanism |
|-------|-----------|
| Auth | JWT (HS256), 1hr expiry, `identity=str(user_id)`, role in `additional_claims` |
| Passwords at rest | Fernet (AES-128-CBC + HMAC-SHA256) via `ENCRYPTION_KEY` |
| Admin routes | `admin_required()` decorator → checks `get_jwt().get('role') == 'admin'` |
| Group access | Role check: admin > manager > member |
| Webhook | `hmac.compare_digest()` timing-safe token comparison |
| Secrets | `.env` file, never in git (`.gitignore` enforced) |
| DB queries | SQLAlchemy ORM — no raw SQL, no injection risk |
| Error responses | Global error handler → always returns JSON (no HTML stack traces) |
| Static routes | `/<path>` restricted to `GET` only |

---

## 13. Environment Variables (`.env`)

```bash
# flask/.env — never committed to git

SECRET_KEY=<flask session secret>
JWT_SECRET_KEY=<jwt signing secret>

DB_HOST=localhost
DB_PORT=3306
DB_NAME=password_manager
DB_USER=<db username>
DB_PASSWORD=<db password>

# Generate once:
# python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
ENCRYPTION_KEY=<fernet key — never change after data exists>

# Same value as GitHub → Settings → Secrets → DEPLOY_SECRET
DEPLOY_SECRET=<webhook auth token>

# Optional: override health check URL (default: https://nextgen.codesen.com/health)
# HEALTH_CHECK_URL=https://nextgen.codesen.com/health
```

---

## 14. Protected Files (Never Overwritten by Auto-Deploy)

| File | Why Protected |
|------|---------------|
| `flask/.env` | Server secrets — never in git |
| `flask/config.py` | May have server-specific overrides |
| `flask/deploy_webhook.py` | Can't overwrite the running webhook receiver |
| `flask/deploy.log` | Audit log — must persist across deploys |

> To update `deploy_webhook.py` on the server, manually copy via Plesk File Manager  
> or: `curl -s <raw_github_url> -o /path/to/deploy_webhook.py`

---

## 15. Feature Summary

| Feature | Where |
|---------|-------|
| Personal password vault (CRUD) | Dashboard |
| Password generator | Dashboard |
| Favorites (star/filter) | Dashboard |
| Export to CSV | Dashboard |
| Import from CSV / Bitwarden | Dashboard |
| Search by title, username, URL | Dashboard |
| Dark mode | All pages (persisted) |
| User management | Admin → Users tab |
| All users' passwords view | Admin → All Passwords tab |
| Team / Group management | Admin → Teams tab |
| Shared team password vault | Teams page |
| Department-based access control | Teams page (member / manager roles) |
| Releases-based auto-deploy | deploy_webhook.py |
| Auto-rollback on health fail | deploy_webhook.py |
| Manual rollback | rollback.sh / /rollback-api |
| Deploy log | flask/deploy.log |
