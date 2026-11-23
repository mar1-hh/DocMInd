"""Only mounted in isolated E2E Compose. Exercise the real REST client against a local transport."""
import hashlib
import json
import re

import httpx

from gemini import DIMENSIONS, EMBEDDING, GENERATION, Gemini
from main import create_app


def respond(request):
    assert request.url.host == "generativelanguage.googleapis.com"
    body = json.loads(request.content)
    if request.url.path == f"/v1beta/models/{EMBEDDING}:batchEmbedContents":
        vectors = []
        for item in body["requests"]:
            assert item["outputDimensionality"] == DIMENSIONS
            values = [0] * DIMENSIONS
            for word in re.findall(r"\w+", item["content"]["parts"][0]["text"].lower()):
                values[int(hashlib.sha256(word.encode()).hexdigest(), 16) % DIMENSIONS] += 1
            vectors.append({"values": values})
        return httpx.Response(200, json={"embeddings": vectors})
    assert request.url.path == f"/v1beta/models/{GENERATION}:generateContent"
    context = json.loads(body["contents"][0]["parts"][0]["text"])
    supported = [p for p in context["passages"] if "Juniper" in p["text"] and "code" in context["question"].lower()]
    answer = {"statements": [{"text": p["text"], "citations": [{"passage": p["id"], "quote": "Juniper"}]} for p in supported]}
    return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": json.dumps(answer)}]}}]})


app = create_app(lambda: Gemini(httpx.MockTransport(respond), key="isolated-test-only"))
