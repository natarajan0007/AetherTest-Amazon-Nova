#!/bin/bash

SCREEN_WIDTH=${SCREEN_WIDTH:-1280}
SCREEN_HEIGHT=${SCREEN_HEIGHT:-800}
SCREEN_DEPTH=${SCREEN_DEPTH:-24}
DISPLAY=${DISPLAY:-:99}
XAUTH=/tmp/.xauth-aethertest

cleanup() {
    echo "[sandbox] Shutting down..."
    kill "$XVFB_PID" "$WM_PID" "$CHROME_PID" "$SOCAT_PID" "$VNC_PID" "$NOVNC_PID" "$RECORDER_PID" 2>/dev/null
    exit 0
}
trap cleanup SIGTERM SIGINT

# ── 1. Auth cookie ────────────────────────────────────────────────────────────
rm -f "$XAUTH"
touch "$XAUTH"
export XAUTHORITY="$XAUTH"
COOKIE=$(openssl rand -hex 16)
xauth -f "$XAUTH" add "$DISPLAY" . "$COOKIE"
echo "[sandbox] Xauth cookie generated."

# ── 2. Xvfb ──────────────────────────────────────────────────────────────────
rm -f /tmp/.X${DISPLAY#:}-lock 2>/dev/null || true
echo "[sandbox] Starting Xvfb on $DISPLAY..."
Xvfb "$DISPLAY" \
    -screen 0 "${SCREEN_WIDTH}x${SCREEN_HEIGHT}x${SCREEN_DEPTH}" \
    -auth "$XAUTH" \
    -ac &
XVFB_PID=$!
sleep 2

# ── 3. Set background colour so VNC isn't black ───────────────────────────────
DISPLAY="$DISPLAY" XAUTHORITY="$XAUTH" xsetroot -solid "#1e293b" 2>/dev/null || true

# ── 4. Lightweight window manager (openbox) ───────────────────────────────────
echo "[sandbox] Starting openbox..."
DISPLAY="$DISPLAY" XAUTHORITY="$XAUTH" openbox --config-file /dev/null &
WM_PID=$!
sleep 1

# ── 5. Chromium ───────────────────────────────────────────────────────────────
# Chrome 94+ ignores --remote-debugging-address=0.0.0.0 and always binds CDP
# to 127.0.0.1 only. We therefore start Chrome on port 9221 (loopback-only)
# and use socat to bridge 0.0.0.0:9222 → 127.0.0.1:9221, making the CDP
# endpoint reachable from Docker port-forwarding on the host.
#
# --ignore-certificate-errors  : Bypass Zscaler SSL-inspection cert errors.
#   Corporate proxies re-sign HTTPS traffic with their own CA. Chrome ships
#   its own NSS cert store (separate from the OS store where we installed
#   zscaler.crt), so it rejects Zscaler-signed certs. For a test automation
#   sandbox this flag is the correct and standard solution.
#
# --test-type                  : Suppresses the "unsupported flag" warning bar
#   that --no-sandbox + --ignore-certificate-errors would otherwise show.

# Pre-populate Chrome NSS cert database with the Zscaler CA so cert trust
# survives across Chrome restarts (belt-and-suspenders alongside the flag).
CHROME_DIR=/tmp/chrome-user-data
mkdir -p "${CHROME_DIR}"
if command -v certutil &>/dev/null && [ -f /usr/local/share/ca-certificates/zscaler.crt ]; then
    NSS_DIR="${HOME}/.pki/nssdb"
    mkdir -p "${NSS_DIR}"
    certutil -d "sql:${NSS_DIR}" -N --empty-password 2>/dev/null || true
    certutil -d "sql:${NSS_DIR}" -A -t "CT,C,C" -n "ZscalerRootCA" \
        -i /usr/local/share/ca-certificates/zscaler.crt 2>/dev/null || true
    echo "[sandbox] Zscaler CA imported into Chrome NSS database."
fi

echo "[sandbox] Starting Chromium (CDP 127.0.0.1:9221)..."
DISPLAY="$DISPLAY" XAUTHORITY="$XAUTH" chromium \
    --no-sandbox \
    --test-type \
    --disable-dev-shm-usage \
    --disable-gpu \
    --disable-software-rasterizer \
    --disable-background-timer-throttling \
    --disable-backgrounding-occluded-windows \
    --disable-renderer-backgrounding \
    --ignore-certificate-errors \
    --ignore-urlfetcher-cert-requests \
    --remote-debugging-port=9221 \
    --user-data-dir="${CHROME_DIR}" \
    --window-size="${SCREEN_WIDTH},${SCREEN_HEIGHT}" \
    --window-position=0,0 \
    --start-maximized \
    "https://www.google.com" 2>/tmp/chrome.log &
CHROME_PID=$!
sleep 3

# ── 5b. socat CDP bridge (0.0.0.0:9222 → 127.0.0.1:9221) ─────────────────────
echo "[sandbox] Starting socat CDP bridge (:9222 → :9221)..."
socat TCP4-LISTEN:9222,fork,reuseaddr TCP4:127.0.0.1:9221 &
SOCAT_PID=$!
sleep 1

# ── 6. x11vnc ─────────────────────────────────────────────────────────────────
echo "[sandbox] Starting x11vnc (VNC :5900)..."
x11vnc \
    -display "$DISPLAY" \
    -auth "$XAUTH" \
    -nopw \
    -listen 0.0.0.0 \
    -rfbport 5900 \
    -forever \
    -shared \
    -xkb \
    -noxdamage \
    -quiet 2>/tmp/x11vnc.log &
VNC_PID=$!
sleep 2

# ── 7. noVNC ──────────────────────────────────────────────────────────────────
echo "[sandbox] Starting noVNC (:6080 → :5900)..."
/opt/novnc/utils/websockify/run \
    --web /opt/novnc \
    6080 \
    localhost:5900 2>/tmp/novnc.log &
NOVNC_PID=$!
sleep 1

# ── 8. Recorder API ───────────────────────────────────────────────────────────
echo "[sandbox] Starting recorder API (:8888)..."
python3 /app/recorder.py 2>/tmp/recorder.log &
RECORDER_PID=$!
sleep 1

echo ""
echo "[sandbox] All services running:"
echo "  Xvfb      PID=$XVFB_PID   display=$DISPLAY"
echo "  openbox   PID=$WM_PID"
echo "  Chromium  PID=$CHROME_PID  CDP=127.0.0.1:9221"
echo "  socat     PID=$SOCAT_PID   bridge=0.0.0.0:9222->127.0.0.1:9221"
echo "  x11vnc    PID=$VNC_PID     VNC=:5900"
echo "  noVNC     PID=$NOVNC_PID   WS=:6080"
echo "  Recorder  PID=$RECORDER_PID API=:8888"
echo ""

# ── 9. Monitor loop ───────────────────────────────────────────────────────────
while true; do
    sleep 5

    if ! kill -0 "$XVFB_PID" 2>/dev/null; then
        echo "[sandbox] Xvfb died — restarting..."
        Xvfb "$DISPLAY" -screen 0 "${SCREEN_WIDTH}x${SCREEN_HEIGHT}x${SCREEN_DEPTH}" -auth "$XAUTH" -ac &
        XVFB_PID=$!
        sleep 2
        DISPLAY="$DISPLAY" XAUTHORITY="$XAUTH" xsetroot -solid "#1e293b" 2>/dev/null || true
    fi

    if ! kill -0 "$VNC_PID" 2>/dev/null; then
        echo "[sandbox] x11vnc died — restarting..."
        x11vnc -display "$DISPLAY" -auth "$XAUTH" -nopw -listen 0.0.0.0 \
            -rfbport 5900 -forever -shared -xkb -noxdamage -quiet &
        VNC_PID=$!
    fi

    if ! kill -0 "$NOVNC_PID" 2>/dev/null; then
        echo "[sandbox] noVNC died — restarting..."
        /opt/novnc/utils/websockify/run --web /opt/novnc 6080 localhost:5900 &
        NOVNC_PID=$!
    fi

    if ! kill -0 "$RECORDER_PID" 2>/dev/null; then
        echo "[sandbox] Recorder died — restarting..."
        python3 /app/recorder.py &
        RECORDER_PID=$!
    fi
done
