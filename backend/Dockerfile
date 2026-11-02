FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
COPY pyproject.toml .
RUN pip install -e ".[dev]" || true
COPY . .
RUN pip install -e .
RUN useradd -m app && chown -R app /app
USER app
CMD ["sh", "-c", "alembic upgrade head && python -m app.seed && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
