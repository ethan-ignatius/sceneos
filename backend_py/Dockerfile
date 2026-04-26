# SceneOS backend — Cloud Run image.
# python:3.11-slim keeps the image small. We install via pyproject.toml so
# the dep list stays in one place; pip's editable install (-e) is used in
# dev but Cloud Run gets a regular install.

FROM python:3.11-slim

WORKDIR /app

# System deps. Keep this lean — anything beyond ca-certificates needs
# justifying because each line bloats the image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first so this layer caches across code changes.
COPY pyproject.toml ./
RUN pip install --no-cache-dir .

# App code goes after the deps install so a code-only change doesn't
# invalidate the dep layer.
COPY sceneos_py ./sceneos_py

# Cloud Run sets PORT (default 8080); honor it.
ENV PORT=8080
EXPOSE 8080

# `--proxy-headers` so X-Forwarded-* from Cloud Run's load balancer is
# trusted. `--workers 1` is correct for Cloud Run — concurrency is handled
# by the platform spinning up more instances, not threads inside one.
CMD ["sh", "-c", "uvicorn sceneos_py.app:app --host 0.0.0.0 --port ${PORT} --proxy-headers --workers 1"]
