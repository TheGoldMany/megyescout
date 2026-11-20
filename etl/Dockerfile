FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 TZ=Europe/Budapest
WORKDIR /app/etl
COPY etl/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY etl/ .
COPY db/ /app/db/
ENV MIGRATIONS_DIR=/app/db/migrations
# Long-running worker: applies migrations, then scrapes Monday 06:00 and Wednesday 21:00.
CMD ["python", "cli.py", "schedule", "--profiles"]
