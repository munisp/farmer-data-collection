"""Tests for the Conversational Commerce Service."""
import unittest
from main import NLUEngine, ConversationManager, SUPPORTED_CROPS


class TestNLUEngine(unittest.TestCase):
    def test_sell_intent(self):
        result = NLUEngine.parse_intent("sell 50kg maize")
        self.assertEqual(result["intent"], "sell")
        self.assertEqual(result["entities"]["quantity"], 50)
        self.assertEqual(result["entities"]["crop"], "maize")

    def test_buy_intent(self):
        result = NLUEngine.parse_intent("I want to buy 100kg beans")
        self.assertEqual(result["intent"], "buy")
        self.assertEqual(result["entities"]["quantity"], 100)
        self.assertEqual(result["entities"]["crop"], "beans")

    def test_price_check(self):
        result = NLUEngine.parse_intent("what's the price of coffee")
        self.assertEqual(result["intent"], "price_check")
        self.assertEqual(result["entities"]["crop"], "coffee")

    def test_balance_check(self):
        result = NLUEngine.parse_intent("check my balance")
        self.assertEqual(result["intent"], "balance")

    def test_greeting(self):
        result = NLUEngine.parse_intent("hello")
        self.assertEqual(result["intent"], "greeting")

    def test_help(self):
        result = NLUEngine.parse_intent("help")
        self.assertEqual(result["intent"], "help")

    def test_order_status(self):
        result = NLUEngine.parse_intent("track my order")
        self.assertEqual(result["intent"], "order_status")

    def test_unknown_intent(self):
        result = NLUEngine.parse_intent("asdfghjkl")
        self.assertEqual(result["intent"], "unknown")

    def test_confidence_score(self):
        result = NLUEngine.parse_intent("sell 50kg maize")
        self.assertGreater(result["confidence"], 0.8)


class TestConversationManager(unittest.TestCase):
    def setUp(self):
        self.cm = ConversationManager()

    def test_new_session(self):
        session = self.cm.get_session("user1")
        self.assertEqual(session["user_id"], "user1")
        self.assertEqual(session["state"], "idle")
        self.assertEqual(session["balance"], 50000.0)

    def test_greeting_response(self):
        result = self.cm.process_message("user1", "hello")
        self.assertIn("Jambo", result["text"])
        self.assertEqual(result["intent"], "greeting")

    def test_sell_flow(self):
        result = self.cm.process_message("user1", "sell 50kg maize")
        self.assertEqual(result["intent"], "sell")
        self.assertIn("Sell Order Summary", result["text"])
        self.assertIn("2,250", result["text"])  # 50 * 45 = 2250

    def test_buy_flow(self):
        result = self.cm.process_message("user2", "buy 100kg beans")
        self.assertEqual(result["intent"], "buy")
        self.assertIn("Buy Order Summary", result["text"])

    def test_price_check_flow(self):
        result = self.cm.process_message("user3", "price of coffee")
        self.assertIn("350", result["text"])

    def test_unsupported_crop(self):
        result = self.cm.process_message("user4", "sell 50kg dragon_fruit")
        self.assertIn("don't have", result["text"].lower())

    def test_insufficient_balance(self):
        result = self.cm.process_message("user5", "buy 10000kg coffee")
        # 10000 * 350 = 3,500,000 > 50,000 balance
        self.assertIn("Insufficient", result["text"])

    def test_balance_response(self):
        result = self.cm.process_message("user6", "balance")
        self.assertIn("50,000", result["text"])

    def test_supported_crops_count(self):
        self.assertEqual(len(SUPPORTED_CROPS), 10)

    def test_sell_quantities(self):
        """Verify sell price calculation for each crop."""
        for crop, info in SUPPORTED_CROPS.items():
            result = self.cm.process_message(f"test_{crop}", f"sell 100kg {crop}")
            expected = info["avg_price"] * 100
            self.assertIn(f"{expected:,.0f}", result["text"],
                         f"Expected {expected} in response for {crop}")


class TestOrderConfirmation(unittest.TestCase):
    def setUp(self):
        self.cm = ConversationManager()

    def test_confirm_sell_order(self):
        self.cm.process_message("seller1", "sell 50kg maize")
        session = self.cm.get_session("seller1")
        self.assertIsNotNone(session["pending_order"])
        self.assertEqual(session["state"], "confirming_sell")

    def test_confirm_buy_order(self):
        self.cm.process_message("buyer1", "buy 10kg beans")
        session = self.cm.get_session("buyer1")
        self.assertIsNotNone(session["pending_order"])
        self.assertEqual(session["state"], "confirming_buy")


if __name__ == "__main__":
    unittest.main()
