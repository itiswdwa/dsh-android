#!/usr/bin/env python3
"""Serve one APK to a phone that is standing right next to this one.

This exists so the file never touches the internet: the classmate connects to
this phone's hotspot (or the same WiFi) and pulls the APK over the local link.
The hotspot itself does not bill data for traffic that stays between the two
devices.

Only the one file is exposed, deliberately: /sdcard/Download also holds the
user's own downloads, and a directory listing would hand those over too.

Usage: serve_apk.py [--port N] [--file PATH]
"""
from __future__ import annotations

import argparse
import html
import socket
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DEFAULT_FILE = Path("/var/minis/mounts/Download/dsh-android.apk")
DEFAULT_PORT = 8777


def lan_addresses() -> list[str]:
    """Every non-loopback IPv4 address the device currently has."""
    out: list[str] = []
    try:
        text = subprocess.run(["ifconfig"], capture_output=True, text=True, timeout=5).stdout
    except Exception:
        return out
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("inet addr:"):
            address = line.split()[1]
            if not address.startswith("127."):
                out.append(address.split("/")[0])
    return out


class Handler(BaseHTTPRequestHandler):
    apk: Path = DEFAULT_FILE
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):  # keep the console quiet
        pass

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            body = (
                "<!doctype html><meta name=viewport content='width=device-width'>"
                "<body style='font-family:sans-serif;padding:24px'>"
                "<h2>DSH Android</h2>"
                f"<p><a style='font-size:20px' href='/dsh-android.apk'>下载 {html.escape(self.apk.name)}"
                f"（{self.apk.stat().st_size // 1048576} MB）</a></p>"
                "<p style='color:#666'>安装时如提示「未知来源」，请在系统设置里允许本次安装。</p>"
                "</body>"
            ).encode("utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.split("?")[0] in ("/dsh-android.apk", "/" + self.apk.name):
            size = self.apk.stat().st_size
            self.send_response(200)
            self.send_header("Content-Type", "application/vnd.android.package-archive")
            self.send_header("Content-Length", str(size))
            self.send_header("Content-Disposition", f'attachment; filename="{self.apk.name}"')
            self.end_headers()
            with open(self.apk, "rb") as handle:
                while chunk := handle.read(1 << 16):
                    self.wfile.write(chunk)
            return
        self.send_error(404)

    def do_HEAD(self) -> None:  # noqa: N802
        if self.path.split("?")[0] in ("/dsh-android.apk", "/" + self.apk.name):
            self.send_response(200)
            self.send_header("Content-Type", "application/vnd.android.package-archive")
            self.send_header("Content-Length", str(self.apk.stat().st_size))
            self.end_headers()
            return
        self.send_error(404)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--file", type=Path, default=DEFAULT_FILE)
    args = parser.parse_args()
    Handler.apk = args.file
    if not Handler.apk.is_file():
        raise SystemExit(f"missing {Handler.apk}")

    server = ThreadingHTTPServer(("0.0.0.0", args.port), Handler)
    print(f"serving {Handler.apk} on 0.0.0.0:{args.port}", flush=True)
    for address in lan_addresses():
        print(f"  http://{address}:{args.port}/", flush=True)
    if not lan_addresses():
        print("  (no LAN address yet — start the hotspot, then re-check)", flush=True)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
