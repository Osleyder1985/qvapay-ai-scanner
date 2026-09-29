#!/usr/bin/env python3
"""Local backend for the QvaPay P2P market dashboard."""

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen

BASE_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIR = BASE_DIR / "frontend"
QVAPAY_API_BASE_URL = os.getenv("QVAPAY_API_BASE_URL", "https://api.qvapay.com").rstrip("/")
HOST = os.getenv("DASHBOARD_HOST", "127.0.0.1")
PORT = int(os.getenv("DASHBOARD_PORT", "8080"))


def qvapay_headers():
    app_id = os.getenv("QVAPAY_APP_ID")
    app_secret = os.getenv("QVAPAY_APP_SECRET")
    if not app_id or not app_secret:
        raise RuntimeError("Faltan QVAPAY_APP_ID y QVAPAY_APP_SECRET en las variables de entorno.")
    return {
        "Accept": "application/json",
        "app-id": app_id,
        "app-secret": app_secret,
        "User-Agent": "qvapay-ai-scanner-p2p-dashboard/0.1",
    }


def fetch_p2p(query):
    allowed = {
        "page", "take", "type", "coin", "orderBy", "orderType",
        "min", "max", "ratio_min", "ratio_max", "only_vip"
    }
    params = {key: value for key, value in query.items() if key in allowed and value}
    if "take" in params:
        params["take"] = str(min(max(int(params["take"]), 1), 100))
    else:
        params["take"] = "100"

    url = f"{QVAPAY_API_BASE_URL}/p2p?{urlencode(params)}"
    request = Request(url, headers=qvapay_headers(), method="GET")
    with urlopen(request, timeout=20) as response:
        return response.status, json.loads(response.read().decode("utf-8"))


class DashboardHandler(BaseHTTPRequestHandler):
    server_version = "QvaPayP2PDashboard/0.1"

    def _send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path, content_type):
        try:
            body = path.read_bytes()
        except FileNotFoundError:
            self._send_json(404, {"error": "Archivo no encontrado"})
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/health":
            self._send_json(200, {"ok": True, "service": "p2p-market-dashboard"})
            return

        if parsed.path == "/api/p2p":
            try:
                query = {
                    key: values[0]
                    for key, values in parse_qs(parsed.query).items()
                    if values
                }
                status, payload = fetch_p2p(query)
                self._send_json(status, payload)
            except RuntimeError as exc:
                self._send_json(500, {"error": str(exc)})
            except HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="replace")
                try:
                    detail = json.loads(detail)
                except json.JSONDecodeError:
                    detail = {"message": detail}
                self._send_json(exc.code, {"error": "QvaPay API error", "detail": detail})
            except (URLError, TimeoutError) as exc:
                self._send_json(502, {"error": "No se pudo contactar con QvaPay", "detail": str(exc)})
            except (ValueError, json.JSONDecodeError) as exc:
                self._send_json(400, {"error": "Parámetros inválidos", "detail": str(exc)})
            return

        if parsed.path in ("/", "/index.html"):
            self._send_file(FRONTEND_DIR / "index.html", "text/html; charset=utf-8")
            return
        if parsed.path == "/styles.css":
            self._send_file(FRONTEND_DIR / "styles.css", "text/css; charset=utf-8")
            return
        if parsed.path == "/app.js":
            self._send_file(FRONTEND_DIR / "app.js", "text/javascript; charset=utf-8")
            return

        self._send_json(404, {"error": "Ruta no encontrada"})

    def log_message(self, format, *args):
        print(f"[dashboard] {self.address_string()} - {format % args}")


if __name__ == "__main__":
    print(f"QvaPay P2P Dashboard: http://{HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), DashboardHandler).serve_forever()
