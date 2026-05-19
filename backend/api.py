from flask import Flask, jsonify
from flask_cors import CORS
import time

app = Flask(__name__)
CORS(app)

# shared state (IMPORT DARI CONTROL FILE IDEALLY)
import threading

capture_event = threading.Event()
system_status = {
    "camera": "ready",
    "last_capture": None
}


# =========================
# STATUS ENDPOINT (REAL)
# =========================
@app.route("/status")
def status():

    return jsonify({
        "system": "running",
        "camera": system_status["camera"],
        "last_capture": system_status["last_capture"]
    })


# =========================
# CAPTURE TRIGGER
# =========================
@app.route("/capture")
def capture():

    print("📸 Capture request diterima via API")

    capture_event.set()

    return jsonify({
        "message": "Capture triggered"
    })


# =========================
# OPTIONAL: RESET EVENT
# =========================
@app.route("/reset")
def reset():

    capture_event.clear()

    return jsonify({
        "message": "reset ok"
    })


# =========================
# START SERVER
# =========================
if __name__ == "__main__":
    print("🚀 API running on port 5000")
    app.run(port=5000, debug=True)