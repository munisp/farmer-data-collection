"""Voice Navigation Service — Python
Provides voice-first navigation for low-literacy farmers.
Supports Yoruba, Hausa, Igbo, and English voice commands
mapped to FarmConnect platform actions.
"""
import json
import os
import re
from datetime import datetime, timezone
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Any

PORT = int(os.environ.get("VOICE_SERVICE_PORT", "8109"))

# Voice command mappings — multilingual (English, Yoruba, Hausa, Igbo)
VOICE_COMMANDS = {
    # Navigation commands
    "dashboard": {"route": "/", "labels": {"en": "Dashboard", "yo": "Ibi Iworan", "ha": "Dashboard", "ig": "Dashboard"}},
    "marketplace": {"route": "/marketplace", "labels": {"en": "Marketplace", "yo": "Oja", "ha": "Kasuwa", "ig": "Ahia"}},
    "my_farms": {"route": "/farm-geotagging", "labels": {"en": "My Farms", "yo": "Oko Mi", "ha": "Gonarki Na", "ig": "Ugbo M"}},
    "orders": {"route": "/orders", "labels": {"en": "My Orders", "yo": "Aṣẹ Mi", "ha": "Oda-oda Na", "ig": "Nnyocha M"}},
    "weather": {"route": "/weather-alerts", "labels": {"en": "Weather", "yo": "Oju Ojo", "ha": "Yanayi", "ig": "Ihu Igwe"}},
    "prices": {"route": "/price-discovery", "labels": {"en": "Prices", "yo": "Owo", "ha": "Farashi", "ig": "Ọnụ Ahịa"}},
    "sell": {"route": "/marketplace/create", "labels": {"en": "Sell", "yo": "Ta", "ha": "Sayar", "ig": "Ree"}},
    "delivery": {"route": "/delivery", "labels": {"en": "Delivery", "yo": "Ifiranṣẹ", "ha": "Aiko", "ig": "Nnyefe"}},
    "money": {"route": "/mobile-money", "labels": {"en": "Mobile Money", "yo": "Owo Foonu", "ha": "Kudin Waya", "ig": "Ego Ekwentị"}},
    "help": {"route": "/help", "labels": {"en": "Help", "yo": "Iranlọwọ", "ha": "Taimako", "ig": "Enyemaka"}},
    "settings": {"route": "/settings", "labels": {"en": "Settings", "yo": "Eto", "ha": "Saiti", "ig": "Ntọala"}},
    "loans": {"route": "/loan-application", "labels": {"en": "Loans", "yo": "Awin", "ha": "Bashi", "ig": "Gbaziri Ego"}},
    "savings": {"route": "/savings", "labels": {"en": "Savings", "yo": "Ifipamọ", "ha": "Ajiyar Kuɗi", "ig": "Chekwa Ego"}},
    "cooperative": {"route": "/cooperative", "labels": {"en": "Cooperative", "yo": "Ẹgbẹ", "ha": "Haɗin Kai", "ig": "Otu"}},
    "soil": {"route": "/soil-analysis", "labels": {"en": "Soil Test", "yo": "Idanwo Ilẹ", "ha": "Gwajin Ƙasa", "ig": "Ule Ala"}},
    "satellite": {"route": "/satellite-imagery", "labels": {"en": "Satellite", "yo": "Satẹlaiti", "ha": "Tauraron Dan Adam", "ig": "Satịlaịtị"}},
}

# Keyword aliases for fuzzy matching
KEYWORD_ALIASES = {
    "buy": "marketplace", "purchase": "marketplace", "shop": "marketplace",
    "farm": "my_farms", "land": "my_farms", "oko": "my_farms",
    "sell": "sell", "list": "sell", "ta": "sell",
    "deliver": "delivery", "track": "delivery", "ship": "delivery",
    "pay": "money", "send money": "money", "transfer": "money",
    "loan": "loans", "borrow": "loans", "credit": "loans",
    "save": "savings", "deposit": "savings",
    "group": "cooperative", "chama": "cooperative",
    "rain": "weather", "sun": "weather", "ojo": "weather",
    "price": "prices", "cost": "prices", "owo": "prices",
    "plant": "soil", "dirt": "soil",
    "home": "dashboard", "start": "dashboard",
    "order": "orders", "receipt": "orders",
}

# Text-to-speech responses (multilingual)
TTS_RESPONSES = {
    "welcome": {
        "en": "Welcome to FarmConnect. What would you like to do? Say marketplace, my farms, sell, or help.",
        "yo": "Kaabo si FarmConnect. Kini o fẹ ṣe? Sọ oja, oko mi, ta, tabi iranlọwọ.",
        "ha": "Barka da zuwa FarmConnect. Me kuke so ku yi? Ku ce kasuwa, gonarki, sayar, ko taimako.",
        "ig": "Nnọọ na FarmConnect. Gịnị ị chọrọ ime? Kwuo ahịa, ugbo m, ree, ma enyemaka.",
    },
    "not_understood": {
        "en": "I didn't understand. Please say marketplace, sell, weather, prices, or help.",
        "yo": "Mi o gbọ. Jọwọ sọ oja, ta, oju ojo, owo, tabi iranlọwọ.",
        "ha": "Ban fahimta ba. Da fatan za ka ce kasuwa, sayar, yanayi, farashi, ko taimako.",
        "ig": "Aghọtaghị m. Biko kwuo ahịa, ree, ihu igwe, ọnụ ahịa, ma enyemaka.",
    },
    "navigating": {
        "en": "Going to {page}.",
        "yo": "A n lọ si {page}.",
        "ha": "Muna zuwa {page}.",
        "ig": "Anyị na-aga {page}.",
    },
}

interaction_log: list[dict[str, Any]] = []


def process_voice_command(text: str, language: str = "en") -> dict[str, Any]:
    """Match voice input to a navigation command."""
    text_lower = text.lower().strip()

    # Direct command match
    for cmd_key, cmd_info in VOICE_COMMANDS.items():
        # Check command key
        if cmd_key in text_lower:
            label = cmd_info["labels"].get(language, cmd_info["labels"]["en"])
            return {
                "matched": True,
                "command": cmd_key,
                "route": cmd_info["route"],
                "label": label,
                "confidence": 0.95,
                "response_text": TTS_RESPONSES["navigating"][language].format(page=label),
            }
        # Check translated labels
        for lang, label in cmd_info["labels"].items():
            if label.lower() in text_lower:
                return {
                    "matched": True,
                    "command": cmd_key,
                    "route": cmd_info["route"],
                    "label": cmd_info["labels"].get(language, label),
                    "confidence": 0.90,
                    "response_text": TTS_RESPONSES["navigating"][language].format(page=label),
                }

    # Alias match
    for alias, cmd_key in KEYWORD_ALIASES.items():
        if alias in text_lower:
            cmd_info = VOICE_COMMANDS[cmd_key]
            label = cmd_info["labels"].get(language, cmd_info["labels"]["en"])
            return {
                "matched": True,
                "command": cmd_key,
                "route": cmd_info["route"],
                "label": label,
                "confidence": 0.75,
                "response_text": TTS_RESPONSES["navigating"][language].format(page=label),
            }

    # No match
    return {
        "matched": False,
        "command": None,
        "route": None,
        "label": None,
        "confidence": 0.0,
        "response_text": TTS_RESPONSES["not_understood"].get(language, TTS_RESPONSES["not_understood"]["en"]),
        "suggestions": list(VOICE_COMMANDS.keys())[:6],
    }


class VoiceHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self._json_response({
                "status": "ok",
                "service": "voice-navigation",
                "commands": len(VOICE_COMMANDS),
                "languages": ["en", "yo", "ha", "ig"],
                "interactions": len(interaction_log),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        elif self.path == "/commands":
            self._json_response(VOICE_COMMANDS)
        elif self.path == "/languages":
            self._json_response({
                "supported": [
                    {"code": "en", "name": "English"},
                    {"code": "yo", "name": "Yorùbá"},
                    {"code": "ha", "name": "Hausa"},
                    {"code": "ig", "name": "Igbo"},
                ],
            })
        elif self.path == "/tts/welcome":
            params = self._parse_query()
            lang = params.get("lang", "en")
            self._json_response({
                "text": TTS_RESPONSES["welcome"].get(lang, TTS_RESPONSES["welcome"]["en"]),
                "language": lang,
            })
        else:
            self._json_response({"error": "Not found"}, 404)

    def do_POST(self):
        body = self._read_body()

        if self.path == "/recognize":
            text = body.get("text", "")
            language = body.get("language", "en")
            result = process_voice_command(text, language)

            interaction_log.append({
                "input": text,
                "language": language,
                "matched": result["matched"],
                "command": result["command"],
                "confidence": result["confidence"],
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

            self._json_response(result)

        elif self.path == "/recognize/batch":
            commands = body.get("commands", [])
            language = body.get("language", "en")
            results = [process_voice_command(cmd, language) for cmd in commands]
            self._json_response({"results": results})

        else:
            self._json_response({"error": "Not found"}, 404)

    def _json_response(self, data: Any, status: int = 200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data, default=str).encode())

    def _read_body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length))

    def _parse_query(self) -> dict[str, str]:
        if "?" not in self.path:
            return {}
        query = self.path.split("?", 1)[1]
        params = {}
        for pair in query.split("&"):
            if "=" in pair:
                k, v = pair.split("=", 1)
                params[k] = v
        return params

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    print(f"Voice Navigation service starting on :{PORT}")
    server = HTTPServer(("0.0.0.0", PORT), VoiceHandler)
    server.serve_forever()
