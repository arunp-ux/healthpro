"""Serve the public website and prepare WhatsApp enquiries. Python 3.9+."""
import json
import os
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "dist"
INTERESTS = ("Meal planning", "Movement coaching", "Everyday wellness", "Membership")
SETTINGS = ROOT / "settings.json"


def recipient():
    value = os.environ.get("KIYA_WHATSAPP_NUMBER")
    if value is None:
        value = json.loads(SETTINGS.read_text(encoding="utf-8-sig"))["whatsapp_number"]
    digits = re.sub(r"[ +()-]", "", str(value))
    return digits if re.fullmatch(r"[1-9][0-9]{7,14}", digits) else ""


def prepare(data):
    if not isinstance(data, dict):
        raise ValueError("Please check the enquiry form.")
    fields = {}
    for key, limit in (("name", 80), ("phone", 25), ("interest", 60), ("message", 500)):
        value = data.get(key, "")
        if not isinstance(value, str) or len(value) > limit:
            raise ValueError("Please check the length of your enquiry.")
        fields[key] = value.strip()
    if not fields["name"] or fields["interest"] not in INTERESTS:
        raise ValueError("Please enter your name and choose a service.")
    if not re.fullmatch(r"\+?[0-9]{7,15}", re.sub(r"[ ()-]", "", fields["phone"])):
        raise ValueError("Please enter a valid contact number.")
    number = recipient()
    if not number:
        return 503, {"error": "WhatsApp enquiries will open once the studio adds its business number."}
    lines = ["Hello HealthyProWithKiya! I would like to enquire.", "Name: " + fields["name"],
             "Contact: " + fields["phone"], "Interest: " + fields["interest"]]
    if fields["message"]:
        lines.append("My question: " + fields["message"])
    return 200, {"url": "https://wa.me/" + number + "?" + urlencode({"text": "\n".join(lines)})}


class Website(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def list_directory(self, path):
        self.send_error(404)
        return None

    def do_POST(self):
        if self.path != "/api/enquiry":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 8192:
                raise ValueError("Please submit a shorter enquiry.")
            data = json.loads(self.rfile.read(length))
            code, result = prepare(data)
        except (ValueError, UnicodeError):
            code, result = 400, {"error": "Please check your name, contact number and service selection."}
        payload = json.dumps(result).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    print(f"HealthyProWithKiya: http://{host}:{port}", flush=True)
    ThreadingHTTPServer((host, port), partial(Website, directory=str(PUBLIC))).serve_forever()

