# ═══════════════════════════════════════════════════════════════════════════════
# Stage 1 — Builder
#   Compiles any C extensions (e.g. cryptography) and installs dependencies.
#   gcc stays in this stage only — runtime image stays lean.
# ═══════════════════════════════════════════════════════════════════════════════
FROM python:3.11-slim AS builder

WORKDIR /build

# gcc + libffi required to compile the `cryptography` package if wheels are
# unavailable for this platform. Removed from runtime stage.
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc \
        libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first → Docker layer cache: only re-installs when
# requirements.txt changes, not on every code change.
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/deps -r requirements.txt


# ═══════════════════════════════════════════════════════════════════════════════
# Stage 2 — Runtime
#   Minimal image: no compilers, no build tools.
# ═══════════════════════════════════════════════════════════════════════════════
FROM python:3.11-slim AS runtime

WORKDIR /app

# Copy compiled packages from the builder stage
COPY --from=builder /deps /usr/local

# Create a non-root system user to run the app
RUN useradd --system --create-home --uid 1001 --shell /bin/bash appuser

# Copy application source (everything not excluded by .dockerignore)
COPY . .

# Give the app user ownership of the working directory
RUN chown -R appuser:appuser /app

USER appuser

# ── Runtime config ────────────────────────────────────────────────────────────
# PORT can be overridden at runtime: docker run -e PORT=8080 ...
ENV PORT=5000 \
    LOG_LEVEL=info \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

EXPOSE 5000

# ── Health check ─────────────────────────────────────────────────────────────
# Probes /health every 30 s; waits 20 s for the app to start (gunicorn
# pre-loads the app factory which runs db.create_all, so startup is ~5-10 s).
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${PORT}/health')" || exit 1

# ── Entry point ───────────────────────────────────────────────────────────────
CMD ["gunicorn", "--config", "gunicorn.conf.py", "app:create_app()"]
