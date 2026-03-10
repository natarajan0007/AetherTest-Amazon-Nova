FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:99
ENV SCREEN_WIDTH=1280
ENV SCREEN_HEIGHT=800
ENV SCREEN_DEPTH=24

# ── 1. Install ca-certificates first ──────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ── 2. Add Wipro corporate certificate ────────────────────────────────────────
COPY wipro.pem /usr/local/share/ca-certificates/wipro.crt
RUN update-ca-certificates && \
    cat /usr/local/share/ca-certificates/wipro.crt >> /etc/ssl/certs/ca-certificates.crt

# Set environment variable for git to use the system CA bundle
ENV GIT_SSL_CAINFO=/etc/ssl/certs/ca-certificates.crt

# ── 3. Install all system packages ────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    x11vnc \
    xdotool \
    xauth \
    openssl \
    openbox \
    x11-xserver-utils \
    wget \
    curl \
    git \
    unzip \
    ffmpeg \
    python3 \
    python3-pip \
    supervisor \
    net-tools \
    procps \
    nodejs \
    npm \
    chromium \
    chromium-driver \
    socat \
    libnss3-tools \
    && rm -rf /var/lib/apt/lists/*

# ── 4. noVNC (download as tarball to avoid git SSL issues) ───────────────────
RUN wget --no-check-certificate -O /tmp/novnc.tar.gz https://github.com/novnc/noVNC/archive/refs/tags/v1.4.0.tar.gz \
    && wget --no-check-certificate -O /tmp/websockify.tar.gz https://github.com/novnc/websockify/archive/refs/tags/v0.11.0.tar.gz \
    && mkdir -p /opt/novnc \
    && tar -xzf /tmp/novnc.tar.gz -C /opt/novnc --strip-components=1 \
    && mkdir -p /opt/novnc/utils/websockify \
    && tar -xzf /tmp/websockify.tar.gz -C /opt/novnc/utils/websockify --strip-components=1 \
    && ln -sf /opt/novnc/vnc.html /opt/novnc/index.html \
    && rm /tmp/novnc.tar.gz /tmp/websockify.tar.gz

# ── 5. Python recorder deps ───────────────────────────────────────────────────
RUN pip3 install --no-cache-dir --break-system-packages \
    --trusted-host pypi.org --trusted-host files.pythonhosted.org \
    fastapi uvicorn requests

# ── 6. App ────────────────────────────────────────────────────────────────────
WORKDIR /app
COPY sandbox/start.sh /app/start.sh
COPY sandbox/recorder.py /app/recorder.py
# Fix line endings (Windows CRLF → Unix LF) and make executable
RUN sed -i 's/\r$//' /app/start.sh && chmod +x /app/start.sh

RUN mkdir -p /local-storage/recordings /local-storage/screenshots

EXPOSE 5900 6080 9222 8888

CMD ["/app/start.sh"]
