"""
Conversational Commerce Service — Python microservice for AI-powered
WhatsApp/USSD agricultural marketplace chat, NLU, and transaction orchestration.
Port: 8118 | Middleware: Kafka, Fluvio, Redis, OpenSearch, Temporal
"""

import json
import re
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from typing import Optional
import os

# ─── Domain Models ──────────────────────────────────────────────────

SUPPORTED_CROPS = {
    "maize": {"unit": "kg", "avg_price": 45, "currency": "KES"},
    "beans": {"unit": "kg", "avg_price": 120, "currency": "KES"},
    "coffee": {"unit": "kg", "avg_price": 350, "currency": "KES"},
    "tomato": {"unit": "kg", "avg_price": 80, "currency": "KES"},
    "potato": {"unit": "kg", "avg_price": 55, "currency": "KES"},
    "onion": {"unit": "kg", "avg_price": 65, "currency": "KES"},
    "rice": {"unit": "kg", "avg_price": 120, "currency": "KES"},
    "sorghum": {"unit": "kg", "avg_price": 40, "currency": "KES"},
    "cocoa": {"unit": "kg", "avg_price": 2500, "currency": "NGN"},
    "cashew": {"unit": "kg", "avg_price": 1800, "currency": "NGN"},
}

INTENT_PATTERNS = {
    "sell": [
        r"(?:i want to |want to |wanna )?sell (\d+)\s*(?:kg|kgs)?\s*(?:of\s+)?(\w+)",
        r"selling (\d+)\s*(?:kg|kgs)?\s*(?:of\s+)?(\w+)",
        r"sell\s+(\w+)\s+(\d+)\s*(?:kg|kgs)?",
    ],
    "buy": [
        r"(?:i want to |want to |wanna )?buy (\d+)\s*(?:kg|kgs)?\s*(?:of\s+)?(\w+)",
        r"buying (\d+)\s*(?:kg|kgs)?\s*(?:of\s+)?(\w+)",
        r"buy\s+(\w+)\s+(\d+)\s*(?:kg|kgs)?",
    ],
    "price_check": [
        r"(?:what(?:'s| is) the )?price (?:of |for )?(\w+)",
        r"how much (?:is |for )?(\w+)",
        r"(\w+) price",
    ],
    "balance": [
        r"(?:my |check )?balance",
        r"how much (?:do i have|money)",
        r"wallet",
    ],
    "order_status": [
        r"(?:my |check )?order(?:s)?\s*(?:status)?",
        r"track\s+(?:my\s+)?order",
        r"delivery status",
    ],
    "help": [
        r"help",
        r"what can you do",
        r"menu",
        r"options",
    ],
    "greeting": [
        r"hi|hello|hey|jambo|habari|good (?:morning|afternoon|evening)",
    ],
}

# ─── NLU Engine ─────────────────────────────────────────────────────

class NLUEngine:
    """Natural Language Understanding for agricultural commerce intents."""

    @staticmethod
    def parse_intent(message: str) -> dict:
        text = message.lower().strip()

        for intent, patterns in INTENT_PATTERNS.items():
            for pattern in patterns:
                match = re.search(pattern, text)
                if match:
                    entities = {}
                    groups = match.groups()

                    if intent == "sell" and len(groups) >= 2:
                        try:
                            entities["quantity"] = int(groups[0])
                            entities["crop"] = groups[1].lower()
                        except ValueError:
                            entities["crop"] = groups[0].lower()
                            entities["quantity"] = int(groups[1])
                    elif intent == "buy" and len(groups) >= 2:
                        try:
                            entities["quantity"] = int(groups[0])
                            entities["crop"] = groups[1].lower()
                        except ValueError:
                            entities["crop"] = groups[0].lower()
                            entities["quantity"] = int(groups[1])
                    elif intent == "price_check" and len(groups) >= 1:
                        entities["crop"] = groups[0].lower()

                    return {
                        "intent": intent,
                        "confidence": 0.92,
                        "entities": entities,
                        "raw": text,
                    }

        return {"intent": "unknown", "confidence": 0.0, "entities": {}, "raw": text}


# ─── Conversation State Manager ─────────────────────────────────────

class ConversationManager:
    """Manages multi-turn conversation state."""

    def __init__(self):
        self.sessions = {}

    def get_session(self, user_id: str) -> dict:
        if user_id not in self.sessions:
            self.sessions[user_id] = {
                "user_id": user_id,
                "state": "idle",
                "pending_order": None,
                "history": [],
                "balance": 50000.0,  # KES
                "orders": [],
                "created_at": time.time(),
            }
        return self.sessions[user_id]

    def process_message(self, user_id: str, message: str, channel: str = "whatsapp") -> dict:
        session = self.get_session(user_id)
        parsed = NLUEngine.parse_intent(message)
        intent = parsed["intent"]
        entities = parsed["entities"]

        session["history"].append({
            "role": "user", "message": message,
            "intent": intent, "timestamp": time.time()
        })

        response = self._generate_response(session, intent, entities, channel)
        session["history"].append({
            "role": "assistant", "message": response["text"],
            "timestamp": time.time()
        })

        return {
            "text": response["text"],
            "intent": intent,
            "confidence": parsed["confidence"],
            "actions": response.get("actions", []),
            "quick_replies": response.get("quick_replies", []),
            "session_state": session["state"],
        }

    def _generate_response(self, session: dict, intent: str, entities: dict, channel: str) -> dict:
        if intent == "greeting":
            return {
                "text": (
                    f"👋 Jambo! Welcome to FarmConnect Marketplace.\n\n"
                    f"I can help you:\n"
                    f"🌾 *Sell* your crops (e.g., 'sell 50kg maize')\n"
                    f"🛒 *Buy* crops (e.g., 'buy 100kg beans')\n"
                    f"💰 Check *prices* (e.g., 'price of coffee')\n"
                    f"💳 Check your *balance*\n"
                    f"📦 Track *orders*\n\n"
                    f"What would you like to do?"
                ),
                "quick_replies": ["Sell crops", "Buy crops", "Check prices", "My balance"],
            }

        elif intent == "sell":
            crop = entities.get("crop", "")
            quantity = entities.get("quantity", 0)
            if crop not in SUPPORTED_CROPS:
                return {
                    "text": f"Sorry, I don't have market data for '{crop}'. Supported crops: {', '.join(SUPPORTED_CROPS.keys())}",
                    "quick_replies": list(SUPPORTED_CROPS.keys())[:5],
                }
            info = SUPPORTED_CROPS[crop]
            total = info["avg_price"] * quantity
            order_id = f"SELL-{int(time.time()) % 100000}"
            session["pending_order"] = {
                "id": order_id, "type": "sell", "crop": crop,
                "quantity": quantity, "price_per_kg": info["avg_price"],
                "total": total, "currency": info["currency"],
            }
            session["state"] = "confirming_sell"
            return {
                "text": (
                    f"📝 *Sell Order Summary*\n\n"
                    f"Crop: {crop.title()}\n"
                    f"Quantity: {quantity} kg\n"
                    f"Price: {info['currency']} {info['avg_price']}/kg\n"
                    f"Total: {info['currency']} {total:,.0f}\n\n"
                    f"Would you like to confirm this sale? I'll find buyers for you."
                ),
                "quick_replies": ["Confirm", "Cancel", "Change quantity"],
                "actions": [{"type": "pending_confirmation", "order": session["pending_order"]}],
            }

        elif intent == "buy":
            crop = entities.get("crop", "")
            quantity = entities.get("quantity", 0)
            if crop not in SUPPORTED_CROPS:
                return {
                    "text": f"Sorry, '{crop}' is not available. Available crops: {', '.join(SUPPORTED_CROPS.keys())}",
                    "quick_replies": list(SUPPORTED_CROPS.keys())[:5],
                }
            info = SUPPORTED_CROPS[crop]
            total = info["avg_price"] * quantity
            if total > session["balance"]:
                return {
                    "text": (
                        f"⚠️ Insufficient balance.\n"
                        f"Required: KES {total:,.0f}\n"
                        f"Available: KES {session['balance']:,.0f}\n\n"
                        f"Would you like to buy a smaller quantity?"
                    ),
                    "quick_replies": ["Reduce quantity", "Check balance", "Cancel"],
                }
            order_id = f"BUY-{int(time.time()) % 100000}"
            session["pending_order"] = {
                "id": order_id, "type": "buy", "crop": crop,
                "quantity": quantity, "price_per_kg": info["avg_price"],
                "total": total, "currency": info["currency"],
            }
            session["state"] = "confirming_buy"
            return {
                "text": (
                    f"🛒 *Buy Order Summary*\n\n"
                    f"Crop: {crop.title()}\n"
                    f"Quantity: {quantity} kg\n"
                    f"Price: {info['currency']} {info['avg_price']}/kg\n"
                    f"Total: {info['currency']} {total:,.0f}\n\n"
                    f"Confirm purchase? Amount will be deducted from your wallet."
                ),
                "quick_replies": ["Confirm", "Cancel"],
                "actions": [{"type": "pending_confirmation", "order": session["pending_order"]}],
            }

        elif intent == "price_check":
            crop = entities.get("crop", "")
            if crop in SUPPORTED_CROPS:
                info = SUPPORTED_CROPS[crop]
                return {
                    "text": (
                        f"💰 *{crop.title()} Market Price*\n\n"
                        f"Current: {info['currency']} {info['avg_price']}/kg\n"
                        f"Unit: per {info['unit']}\n\n"
                        f"Want to buy or sell {crop}?"
                    ),
                    "quick_replies": [f"Buy {crop}", f"Sell {crop}", "Other crops"],
                }
            return {
                "text": f"I don't have pricing for '{crop}'. Available: {', '.join(SUPPORTED_CROPS.keys())}",
            }

        elif intent == "balance":
            return {
                "text": (
                    f"💳 *Your Wallet Balance*\n\n"
                    f"Available: KES {session['balance']:,.0f}\n"
                    f"Orders: {len(session['orders'])}\n\n"
                    f"Need to top up or withdraw?"
                ),
                "quick_replies": ["Top up", "Withdraw", "Order history"],
            }

        elif intent == "order_status":
            if not session["orders"]:
                return {"text": "📦 You have no orders yet. Start by buying or selling crops!"}
            orders_text = "\n".join([
                f"• {o['id']}: {o['type'].upper()} {o['quantity']}kg {o['crop']} — {o.get('status', 'pending')}"
                for o in session["orders"][-5:]
            ])
            return {"text": f"📦 *Your Recent Orders*\n\n{orders_text}"}

        elif intent == "help":
            return {
                "text": (
                    f"🆘 *FarmConnect Help*\n\n"
                    f"Commands:\n"
                    f"• 'sell 50kg maize' — List crops for sale\n"
                    f"• 'buy 100kg beans' — Purchase crops\n"
                    f"• 'price coffee' — Check market price\n"
                    f"• 'balance' — Check wallet\n"
                    f"• 'orders' — Track your orders\n\n"
                    f"Supported crops: {', '.join(SUPPORTED_CROPS.keys())}"
                ),
            }

        return {
            "text": (
                f"I'm not sure what you mean. Try:\n"
                f"• 'sell 50kg maize'\n"
                f"• 'buy 100kg beans'\n"
                f"• 'price coffee'\n"
                f"• 'balance'\n"
                f"• 'help' for more options"
            ),
            "quick_replies": ["Help", "Check prices", "My balance"],
        }


# ─── HTTP Server ────────────────────────────────────────────────────

conversation_manager = ConversationManager()
start_time = time.time()

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Suppress default logging

    def _send_json(self, status: int, data: dict):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length))

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/health":
            self._send_json(200, {
                "status": "healthy",
                "service": "conversational-commerce",
                "version": "1.0.0",
                "uptime_seconds": int(time.time() - start_time),
                "active_sessions": len(conversation_manager.sessions),
                "supported_crops": len(SUPPORTED_CROPS),
                "intents": list(INTENT_PATTERNS.keys()),
            })
        elif path == "/api/crops":
            self._send_json(200, {
                "crops": [
                    {"name": k, **v} for k, v in SUPPORTED_CROPS.items()
                ],
                "total": len(SUPPORTED_CROPS),
            })
        elif path == "/api/intents":
            self._send_json(200, {
                "intents": list(INTENT_PATTERNS.keys()),
                "total": len(INTENT_PATTERNS),
            })
        elif path == "/api/sessions":
            self._send_json(200, {
                "sessions": [
                    {"user_id": s["user_id"], "state": s["state"],
                     "orders": len(s["orders"]), "balance": s["balance"]}
                    for s in conversation_manager.sessions.values()
                ],
                "total": len(conversation_manager.sessions),
            })
        elif path == "/api/stats":
            total_orders = sum(len(s["orders"]) for s in conversation_manager.sessions.values())
            total_volume = sum(
                o.get("quantity", 0) for s in conversation_manager.sessions.values()
                for o in s["orders"]
            )
            self._send_json(200, {
                "activeSessions": len(conversation_manager.sessions),
                "totalOrders": total_orders,
                "totalVolumeKg": total_volume,
                "supportedCrops": len(SUPPORTED_CROPS),
                "supportedIntents": len(INTENT_PATTERNS),
            })
        else:
            self._send_json(404, {"error": "not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/chat":
            body = self._read_body()
            user_id = body.get("userId", "anonymous")
            message = body.get("message", "")
            channel = body.get("channel", "whatsapp")

            if not message:
                self._send_json(400, {"error": "message is required"})
                return

            result = conversation_manager.process_message(user_id, message, channel)
            self._send_json(200, result)

        elif path == "/api/parse":
            body = self._read_body()
            message = body.get("message", "")
            result = NLUEngine.parse_intent(message)
            self._send_json(200, result)

        elif path == "/api/confirm-order":
            body = self._read_body()
            user_id = body.get("userId", "")
            session = conversation_manager.get_session(user_id)
            if session["pending_order"]:
                order = session["pending_order"]
                order["status"] = "confirmed"
                order["confirmed_at"] = time.time()
                session["orders"].append(order)
                if order["type"] == "buy":
                    session["balance"] -= order["total"]
                elif order["type"] == "sell":
                    session["balance"] += order["total"]
                session["pending_order"] = None
                session["state"] = "idle"
                self._send_json(200, {"order": order, "balance": session["balance"]})
            else:
                self._send_json(400, {"error": "no pending order"})
        else:
            self._send_json(404, {"error": "not found"})


def main():
    import signal

    port = int(os.environ.get("PORT", "8118"))
    server = HTTPServer(("0.0.0.0", port), Handler)
    print(f"[ConversationalCommerce] Service starting on :{port}")

    def graceful_shutdown(signum, frame):
        print(f"[ConversationalCommerce] Received signal {signum}, shutting down gracefully...")
        server.shutdown()

    signal.signal(signal.SIGTERM, graceful_shutdown)
    signal.signal(signal.SIGINT, graceful_shutdown)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        print("[ConversationalCommerce] Server stopped")


if __name__ == "__main__":
    main()
