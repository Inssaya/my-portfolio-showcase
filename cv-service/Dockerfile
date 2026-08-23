# CV service — FastAPI + ReportLab.
#
# python:3.13-slim, not alpine: ReportLab and Pillow publish manylinux wheels
# that alpine's musl cannot use, so alpine would compile both from source and
# need a full build toolchain in the image to save nothing.
#
# No system font packages are installed. Inter and Playfair Display are vendored
# in app/cv/fonts/ and loaded by path, which is what makes a rendered CV
# byte-identical here, on Windows, and on the deploy host. An image that pulled
# fonts from apt would drift the moment the base image bumped its font versions.
FROM python:3.13-slim

# Bytecode files and stdio buffering both hurt in a container: the first writes
# junk into the layer, the second hides logs when the process is killed.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Requirements first, so a code change does not re-resolve dependencies.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Fail the build rather than the first visitor: if a font is missing from the
# image, every CV silently renders in Helvetica instead of the reference faces.
RUN python -c "\
from app.cv._cvmodern import fonts_are_authentic; \
assert fonts_are_authentic(), 'bundled fonts failed to load'; \
print('fonts OK')"

# Run as a non-root user. The service takes file uploads from the public
# internet; a container escape should not land on root.
RUN useradd --create-home --uid 10001 app && chown -R app:app /app
USER app

# Managed hosts assign the port at runtime and require the app to bind to it —
# Render, Railway and Fly all pass it as $PORT. A hardcoded port makes the
# health check hit nothing and the deploy fail with no useful message. The
# default keeps `docker run -p 8000:8000` working locally.
ENV PORT=8000
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "\
import os,urllib.request,sys; \
sys.exit(0 if urllib.request.urlopen(f\"http://127.0.0.1:{os.environ.get('PORT','8000')}/health\", timeout=4).status == 200 else 1)"

# One worker, deliberately. Sessions and the key pool are per-process state
# (see app/session.py and app/keypool.py); a second worker would break session
# continuity and multiply the effective rate limits. Scaling out is a Phase 2
# change that moves both into Supabase.
#
# Shell form on purpose, so $PORT is expanded by the shell. The exec form would
# pass the literal string "$PORT" to uvicorn.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1
