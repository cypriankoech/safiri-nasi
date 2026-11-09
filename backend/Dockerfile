FROM python:3.12-slim AS base

# WeasyPrint needs Pango/HarfBuzz for PDF rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b libharfbuzz-subset0 fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv
WORKDIR /app
# The virtualenv lives outside /app so a bind-mounted source tree can't hide it.
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH" PYTHONUNBUFFERED=1
COPY pyproject.toml uv.lock ./

# --- Development: all deps (incl. pytest), source bind-mounted, auto-reload ---
FROM base AS dev
RUN uv sync --frozen --no-install-project
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"]

# --- Production: runtime deps only, non-root ---
FROM base AS prod
RUN uv sync --frozen --no-dev --no-install-project
COPY . .
RUN useradd --system --uid 10001 app && mkdir -p uploads && chown -R app:app uploads
USER app
EXPOSE 8000
# One worker: the in-process scheduler (hold expiry, reminders) must run exactly once.
# PORT is set by hosts such as Render; it defaults to 8000.
# SEED_ON_START=true loads the starter catalogue into an empty database (handy for previews).
CMD ["sh", "-c", "alembic upgrade head && if [ \"$SEED_ON_START\" = true ]; then python -m app.seed --if-empty; fi && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
