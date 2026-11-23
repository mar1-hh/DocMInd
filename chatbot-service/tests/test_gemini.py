import unittest
from unittest.mock import Mock, patch

import httpx

from gemini import ChatError, GENERATION, Gemini


class ProviderFailureTests(unittest.TestCase):
    method = f"{GENERATION}:generateContent"

    def provider(self, *responses):
        handler = Mock(side_effect=responses)
        model = Gemini(httpx.MockTransport(handler), "test-key")
        self.addCleanup(model.client.close)
        return model, handler

    @patch("gemini.time.sleep")
    def test_temporary_failure_recovers(self, sleep):
        model, handler = self.provider(httpx.Response(503, headers={"Retry-After": "3"}),
                                       httpx.Response(200, json={"result": "ok"}))
        self.assertEqual(model.post(self.method, {}), {"result": "ok"})
        self.assertEqual(handler.call_count, 2)
        sleep.assert_called_once_with(3)

    @patch("gemini.time.sleep")
    def test_persistent_outage_stops_after_three_attempts(self, sleep):
        model, handler = self.provider(*(httpx.Response(503) for _ in range(3)))
        with self.assertRaises(ChatError) as raised:
            model.post(self.method, {})
        self.assertEqual(raised.exception.code, "GEMINI_UNAVAILABLE")
        self.assertIn(GENERATION, raised.exception.message)
        self.assertEqual(handler.call_count, 3)
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [1, 2])

    @patch("gemini.time.sleep")
    def test_long_retry_after_is_respected(self, sleep):
        model, handler = self.provider(httpx.Response(503, headers={"Retry-After": "60"}))
        with self.assertRaises(ChatError):
            model.post(self.method, {})
        self.assertEqual(handler.call_count, 1)
        sleep.assert_not_called()

    def test_quota_access_and_request_errors_are_distinct_and_redacted(self):
        for status, details, code in [
            (429, [], "GEMINI_QUOTA_LIMIT"),
            (403, [], "GEMINI_ACCESS_DENIED"),
            (400, [{"reason": "API_KEY_INVALID"}], "GEMINI_ACCESS_DENIED"),
            (400, [], "GEMINI_REQUEST_REJECTED"),
            (404, [], "GEMINI_MODEL_NOT_FOUND"),
        ]:
            with self.subTest(status=status, code=code):
                body = {"error": {"message": "private provider details", "details": details}}
                model, handler = self.provider(httpx.Response(status, json=body))
                with self.assertLogs("gemini", level="WARNING") as logs, self.assertRaises(ChatError) as raised:
                    model.post(self.method, {})
                self.assertEqual(raised.exception.code, code)
                self.assertEqual(handler.call_count, 1)
                self.assertNotIn("private provider details", raised.exception.message + str(logs.output))
