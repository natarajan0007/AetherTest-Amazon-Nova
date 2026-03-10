FROM python:3.11-slim

WORKDIR /app

# ── 1. Install Wipro certificate FIRST ────────────────────────────────────────
COPY wipro.pem /usr/local/share/ca-certificates/wipro.crt

# Install ca-certificates package and update certificates
RUN apt-get update && apt-get install -y ca-certificates \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create pip config to use system certificates
RUN mkdir -p /root/.pip && \
    echo "[global]" > /root/.pip/pip.conf && \
    echo "cert = /etc/ssl/certs/ca-certificates.crt" >> /root/.pip/pip.conf && \
    echo "trusted-host = pypi.org" >> /root/.pip/pip.conf && \
    echo "               pypi.python.org" >> /root/.pip/pip.conf && \
    echo "               files.pythonhosted.org" >> /root/.pip/pip.conf

# Point pip and Python to use the updated certificate bundle
ENV REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
ENV PIP_CERT=/etc/ssl/certs/ca-certificates.crt
ENV CURL_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt

# ── 2. Install other system dependencies ──────────────────────────────────────
RUN apt-get update && apt-get install -y curl wget \
    && rm -rf /var/lib/apt/lists/*

# ── 2. System deps for playwright ─────────────────────────────────────────────
RUN apt-get update && apt-get install -y \
    gnupg \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# ── 3. Python dependencies ────────────────────────────────────────────────────
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install playwright browsers
RUN playwright install chromium --with-deps || true

# ── 4. Copy source ────────────────────────────────────────────────────────────
COPY backend/ .

RUN mkdir -p /local-storage/recordings /local-storage/screenshots /local-storage/reports /app/data

EXPOSE 8001

# AWS credentials will be passed via environment variables or .env file
# No need to set them in the Dockerfile

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--reload"]
