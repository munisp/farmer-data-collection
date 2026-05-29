from flask import Flask, jsonify
import os

app = Flask(__name__)
PORT = int(os.environ.get("GEOCODING_PORT", "8100"))

@app.route("/health")
def health():
    return jsonify({"status": "ok", "service": "geocoding"})

@app.route("/geocode", methods=["POST"])
def geocode():
    return jsonify({"lat": 9.0579, "lng": 7.4951, "address": "Abuja, Nigeria"})

@app.route("/reverse", methods=["POST"])
def reverse_geocode():
    return jsonify({"address": "Abuja, Nigeria", "state": "FCT", "country": "Nigeria"})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT)
