FROM node:20-alpine

WORKDIR /app

# ── 1. Install Wipro certificate ──────────────────────────────────────────────
COPY wipro.pem /tmp/wipro.pem
RUN cat /tmp/wipro.pem >> /etc/ssl/certs/ca-certificates.crt

# Tell Node.js / npm to use the updated system bundle
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

# ── 2. Install npm packages ───────────────────────────────────────────────────
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --legacy-peer-deps

# ── 3. Copy source ────────────────────────────────────────────────────────────
COPY frontend/ .

EXPOSE 3001

CMD ["npm", "run", "dev", "--", "-p", "3001"]
