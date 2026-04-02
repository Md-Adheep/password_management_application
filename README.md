# CorpVault – Corporate Password Manager

A secure, full-stack password management application for corporate users and admins.

---

## Tech Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Backend  | Python 3.10+ / Flask                |
| Database | MySQL 8.0+                          |
| Frontend | HTML5 + Bootstrap 5 + Vanilla JS    |
| Auth     | JWT (Flask-JWT-Extended)            |
| Encrypt  | Fernet symmetric encryption         |

---

## Project Structure

```
password_management_application/
├── backend/
│   ├── app.py                  ← Flask app factory + entry point
│   ├── config.py               ← Configuration (reads .env)
│   ├── extensions.py           ← db, bcrypt, jwt, cors instances
│   ├── models.py               ← User & PasswordEntry models
│   ├── requirements.txt        ← Python dependencies
│   ├── .env.example            ← Copy this to .env and fill values
│   ├── routes/
│   │   ├── auth.py             ← Login, me, change-password
│   │   ├── passwords.py        ← CRUD for password entries + generator
│   │   └── admin.py            ← Admin: user management + stats
│   └── utils/
│       ├── encryption.py       ← Fernet encrypt/decrypt helpers
│       └── password_generator.py ← Secure random password generator
├── frontend/
│   ├── login.html              ← Login page
│   ├── dashboard.html          ← User vault dashboard
│   ├── admin.html              ← Admin panel (user management)
│   ├── css/style.css           ← Custom styles
│   └── js/
│       ├── auth.js             ← Login logic
│       ├── dashboard.js        ← Vault CRUD, generator
│       └── admin.js            ← Admin user management
├── passenger_wsgi.py           ← Phusion Passenger entry point
├── .htaccess                   ← Tells Passenger which Python/venv to use
└── README.md
```

---

## Features

### For Users
- Secure login with JWT tokens
- Add, edit, delete, view password entries
- One-click copy password to clipboard
- Built-in password generator (length, uppercase, digits, symbols)
- Search and filter by category
- Change own login password

### For Admins
- All user features
- Create / edit / delete users
- Activate or deactivate user accounts
- Reset any user's password
- Dashboard stats (total users, passwords, active accounts)

---

## Local Development Setup

### 1. Create MySQL Database

```sql
CREATE DATABASE password_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'pmuser'@'localhost' IDENTIFIED BY 'StrongPassword123!';
GRANT ALL PRIVILEGES ON password_manager.* TO 'pmuser'@'localhost';
FLUSH PRIVILEGES;
```

### 2. Create `.env` file

```bash
cd backend
cp .env.example .env
```

Edit `.env` and fill in your values:

```
SECRET_KEY=generate-a-random-string
JWT_SECRET_KEY=another-random-string
ENCRYPTION_KEY=            # See step 3

DB_HOST=localhost
DB_PORT=3306
DB_USER=pmuser
DB_PASSWORD=StrongPassword123!
DB_NAME=password_manager
```

### 3. Generate Encryption Key

Run this **once** and paste the output into `.env` as `ENCRYPTION_KEY`:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

> **IMPORTANT:** Never change this key after passwords are stored — you won't be able to decrypt them.

### 4. Install Dependencies & Run

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Linux/Mac

pip install -r requirements.txt
python app.py
```

App runs at: `http://localhost:5000`

**Default Admin Credentials** (auto-created on first run):
- Username: `admin`
- Password: `Admin@1234`

> Change this immediately after first login via Admin panel.

---

## Plesk Deployment (Phusion Passenger — no Python UI required)

Follow these steps exactly on your Plesk server.

> **Note:** This setup uses Phusion Passenger directly via `.htaccess`.
> You do **not** need the Plesk Python UI panel.

### Step 1 – Create a Domain / Subdomain in Plesk

1. Log in to **Plesk Panel**
2. Go to **Websites & Domains** → **Add Domain** or **Add Subdomain**  
   Example: `vault.yourcompany.com`
3. Note the document root path (e.g. `/var/www/vhosts/yourcompany.com/vault.yourcompany.com`)

---

### Step 2 – Upload Project Files

Upload the entire project folder to the document root via FTP, SFTP, or Plesk File Manager:

```
/var/www/vhosts/yourcompany.com/vault.yourcompany.com/
├── backend/
├── frontend/
├── passenger_wsgi.py
└── README.md
```

---

### Step 3 – Create `.htaccess` to Configure Passenger

Create `.htaccess` in the domain root (same folder as `passenger_wsgi.py`):

```apache
PassengerEnabled on
PassengerAppRoot /var/www/vhosts/yourcompany.com/vault.yourcompany.com
PassengerPython /var/www/vhosts/yourcompany.com/vault.yourcompany.com/venv/bin/python
```

> Replace the paths with your actual domain root. The `PassengerPython` line
> is critical — it tells Passenger to use the venv you create in Step 4,
> instead of the system Python (which won't have your packages installed).

---

### Step 4 – Create Virtual Environment & Install Packages

SSH into your server:

```bash
ssh user@yourserver.com

# Navigate to domain root
cd /var/www/vhosts/yourcompany.com/vault.yourcompany.com

# Create virtual environment (use the same Python version as Plesk)
python3.10 -m venv venv

# Activate it
source venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt
```

---

### Step 5 – Create the `.env` File on the Server

```bash
cd backend
cp .env.example .env
nano .env       # or use vi / the Plesk file manager
```

Fill in the values (DB credentials, secret keys, encryption key).

Generate the encryption key on the server:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Paste the output as `ENCRYPTION_KEY=...` in `.env`.

---

### Step 6 – Create the MySQL Database on Plesk

1. Plesk Panel → **Databases** → **Add Database**
2. Set database name: `password_manager`
3. Create a database user with a strong password
4. Update `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_HOST` in `.env`

> `DB_HOST` is usually `localhost` on Plesk.

---

### Step 7 – Verify `.htaccess` Paths Match Your venv

Open `.htaccess` and confirm the `PassengerPython` path matches the venv
you created in Step 4:

```bash
# The path must point to the python binary inside your venv
ls /var/www/vhosts/yourcompany.com/vault.yourcompany.com/venv/bin/python
```

If the path is correct, no further Plesk UI configuration is needed —
Passenger reads `.htaccess` automatically.

---

### Step 8 – Restart the Application

In Plesk → Python → click **Restart** (or touch the restart file):

```bash
touch /var/www/vhosts/yourcompany.com/vault.yourcompany.com/tmp/restart.txt
```

---

### Step 9 – Verify Deployment

Open your browser: `https://vault.yourcompany.com`

You should see the CorpVault login page.

Login with:
- Username: `admin`
- Password: `Admin@1234`

---

### Step 10 – Enable HTTPS (SSL)

1. Plesk → **Websites & Domains** → your domain → **SSL/TLS Certificates**
2. Click **Get it free** (Let's Encrypt)
3. Enable **Keep websites secured**
4. Click **Get it free** → Done

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| 500 Internal Server Error | Check Plesk error logs at `logs/error_log`. Usually a missing `.env` or wrong DB credentials |
| Passenger uses wrong Python | Verify `PassengerPython` in `.htaccess` points to `venv/bin/python` |
| Cannot connect to DB | Verify `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` in `.env` |
| `ENCRYPTION_KEY` error | Generate key and add to `backend/.env` |
| Changes not reflecting | Restart app via Plesk or `touch tmp/restart.txt` |
| Login page not loading | Ensure `passenger_wsgi.py` and `.htaccess` are in the domain root (not inside `backend/`) |

---

## Security Notes

- All passwords are encrypted at rest using **Fernet (AES-128-CBC)**
- User login passwords are hashed with **bcrypt**
- API protected with **JWT Bearer tokens**
- Never commit your `.env` file to version control
- Add `.env` and `venv/` to your `.gitignore`
