FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY *.py ./
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
USER nobody
EXPOSE 3003
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3003"]
