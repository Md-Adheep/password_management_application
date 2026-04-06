"""
gunicorn.conf.py — Production Gunicorn configuration for CorpVault.

All values can be overridden via environment variables.
"""
import multiprocessing
import os

# ── Binding ───────────────────────────────────────────────────────────────────
bind = "0.0.0.0:" + os.getenv("PORT", "5000")

# ── Workers ───────────────────────────────────────────────────────────────────
# Formula: (CPU cores * 2) + 1, capped at 4 for typical containers.
# Override with GUNICORN_WORKERS env var.
_default_workers = min(multiprocessing.cpu_count() * 2 + 1, 4)
workers = int(os.getenv("GUNICORN_WORKERS", str(_default_workers)))

worker_class = "sync"
threads = 1

# ── Timeouts ─────────────────────────────────────────────────────────────────
timeout = 120           # Kill workers that exceed this (seconds)
graceful_timeout = 30   # Time to finish in-flight requests on shutdown
keepalive = 5           # Keep-alive connections (seconds)

# ── Request limits ────────────────────────────────────────────────────────────
# Recycle workers after N requests to prevent memory leaks.
max_requests = 1000
max_requests_jitter = 100   # Adds randomness to avoid thundering herd

# ── Performance ───────────────────────────────────────────────────────────────
# Load the app once in the master process; workers fork from it.
# Saves memory and speeds up worker startup.
preload_app = True

# ── Logging ───────────────────────────────────────────────────────────────────
# "-" → stdout/stderr (captured by Docker / your log aggregator)
accesslog = "-"
errorlog  = "-"
loglevel  = os.getenv("LOG_LEVEL", "info")

# Combined-log-like format:  IP  "METHOD /path HTTP/1.1"  status  bytes  duration
access_log_format = '%(h)s "%(r)s" %(s)s %(b)sB %(Ls)ss'
