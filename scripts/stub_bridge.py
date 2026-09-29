#!/usr/bin/env python3
"""Stub of the DSH Android control bridge, for developing the settings page.

Implements exactly the contract the Java BridgeServer must honour, so the
plugin's UI can be exercised in a desktop browser before the APK exists:

    GET  /snapshot                     one poll of everything below
    POST /server/start|stop|restart
    POST /open-in-browser
    POST /import
    POST /distros/select   {id}
    POST /distros/delete   {id}
    POST /distros/command  {id, command}
    POST /settings         {port, apiKey, shareStorage, keepAwake, autoRestart}
    POST /log/clear
    POST /shizuku/request
    POST /shizuku/exec     {command}

Auth: X-Dsh-Token header must match DSH_TOKEN (the app generates one per boot).
Loopback only, and the response carries CORS headers because the Web UI runs on
its own loopback port.
"""
from __future__ import annotations

import json
import os
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = os.environ.get("DSH_TOKEN", "test-token")
PORT = int(os.environ.get("DSH_BRIDGE_PORT", "8399"))

LOCK = threading.Lock()
STATE = {
    "status": {"state": "RUNNING", "url": "http://127.0.0.1:3080/?token=stub", "port": 3080, "error": ""},
    "distros": [
        {"id": "ubuntu", "name": "Ubuntu + Node + dsh（内置）", "path": "/data/user/0/dev.dsh.android/files/distros/ubuntu",
         "bundled": True, "active": True, "command": "cd /opt/dsh && exec /usr/bin/node --expose-internals node_modules/@deepseek-ai/dsh/lib/bin.js web --no-open --port 3080"},
        {"id": "ubuntu-24", "name": "ubuntu-24", "path": "/data/user/0/dev.dsh.android/files/distros/ubuntu-24",
         "bundled": False, "active": False, "command": "exec /bin/bash -l"},
    ],
    "settings": {"port": 3080, "apiKey": "", "shareStorage": True, "keepAwake": True, "autoRestart": True},
    "shizuku": {"installed": True, "granted": True, "version": 13},
    "log": [
        "11:02:14  exec: proot --kill-on-exit --link2symlink -0 -r .../distros/alpine",
        "11:02:15  dsh web: http://127.0.0.1:3080/?token=stub",
    ],
    "import": {"active": False, "message": ""},
}


def snapshot() -> dict:
    with LOCK:
        return json.loads(json.dumps(STATE))


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):  # keep the console readable
        pass

    # ---------------------------------------------------------------- helpers
    def cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "X-Dsh-Token, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def respond(self, payload: dict, code: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.cors()
        self.end_headers()
        self.wfile.write(body)

    def authorized(self) -> bool:
        return self.headers.get("X-Dsh-Token") == TOKEN

    def body(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length == 0:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except json.JSONDecodeError:
            return {}

    # ------------------------------------------------------------------ verbs
    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if not self.authorized():
            self.respond({"error": "unauthorized"}, 401)
            return
        if self.path == "/snapshot":
            self.respond(snapshot())
            return
        self.respond({"error": "not found"}, 404)

    def do_POST(self) -> None:  # noqa: N802
        if not self.authorized():
            self.respond({"error": "unauthorized"}, 401)
            return
        payload = self.body()
        path = self.path
        with LOCK:
            if path == "/server/start":
                STATE["status"]["state"] = "RUNNING"
                message = "已启动"
            elif path == "/server/stop":
                STATE["status"]["state"] = "IDLE"
                message = "已停止"
            elif path == "/server/restart":
                STATE["status"]["state"] = "RUNNING"
                message = "已重启"
            elif path == "/open-in-browser":
                message = "已在系统浏览器打开"
            elif path == "/import":
                message = "已选择归档，正在解包…"
            elif path == "/distros/select":
                for distro in STATE["distros"]:
                    distro["active"] = distro["id"] == payload.get("id")
                message = "已选中 " + str(payload.get("id"))
            elif path == "/distros/delete":
                STATE["distros"] = [d for d in STATE["distros"] if d["id"] != payload.get("id")]
                message = "已删除"
            elif path == "/distros/command":
                for distro in STATE["distros"]:
                    if distro["id"] == payload.get("id"):
                        distro["command"] = payload.get("command", "")
                message = "命令已保存"
            elif path == "/settings":
                STATE["settings"].update({k: v for k, v in payload.items() if k in STATE["settings"]})
                STATE["status"]["port"] = STATE["settings"]["port"]
                message = "设置已保存"
            elif path == "/log/clear":
                STATE["log"] = []
                message = "日志已清空"
            elif path == "/shizuku/request":
                message = "已弹出授权请求，请在手机上确认"
            elif path == "/shizuku/exec":
                command = str(payload.get("command", ""))
                if not STATE["shizuku"]["granted"]:
                    self.respond({"error": "Shizuku 未授权"}, 403)
                    return
                result = subprocess.run(["/bin/sh", "-c", command], capture_output=True, text=True, timeout=30)
                self.respond({"exit": result.returncode, "stdout": result.stdout, "stderr": result.stderr})
                return
            else:
                self.respond({"error": "not found"}, 404)
                return
        self.respond({"ok": True, "message": message})


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"stub bridge on http://127.0.0.1:{PORT} token={TOKEN}")
    server.serve_forever()


if __name__ == "__main__":
    main()
