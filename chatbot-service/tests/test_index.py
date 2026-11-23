import json
import os
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import httpx
from bson import ObjectId
from pymongo import MongoClient

from gemini import ChatError, Gemini, UNSUPPORTED
from indexing import index_next, retrieve
from provider_fixture import respond

PDF = Path(__file__).with_name("field-guide.pdf").read_bytes()


class IndexTests(unittest.TestCase):
    def setUp(self):
        self.mongo = MongoClient(os.environ["MONGO_URI"])
        db = self.mongo.get_default_database()
        self.assertEqual(db.name, "docmind_documents_e2e")
        self.docs = db["test_index_" + uuid4().hex]
        self.addCleanup(self.mongo.close)
        self.addCleanup(self.docs.drop)
        self.http = httpx.Client(base_url="http://documents", transport=httpx.MockTransport(
            lambda req: httpx.Response(200, content=PDF)))
        self.addCleanup(self.http.close)
        self.model = Gemini(httpx.MockTransport(respond), "test")
        self.addCleanup(self.model.client.close)
        self.collection = ObjectId()
        self.id = self.docs.insert_one({"state": "ready", "collectionId": self.collection,
                                        "originalFilename": "field-guide.pdf"}).inserted_id

    def test_legacy_retry_and_expired_claim_replace_passages(self):
        for status in [None, "pending", "indexing"]:
            if status:
                self.docs.update_one({"_id": self.id}, {"$set": {"indexStatus": status,
                    "indexLease": datetime.now(timezone.utc) - timedelta(minutes=1)}})
            self.assertTrue(index_next(self.docs, self.http, self.model))
            doc = self.docs.find_one({"_id": self.id})
            self.assertEqual(doc["indexStatus"], "ready")
            self.assertEqual([p["page"] for p in doc["indexPassages"]], [1, 2])
            self.assertFalse(index_next(self.docs, self.http, self.model))
        vector, = self.model.embed(["task: question answering | query: project code name"])
        self.assertEqual(retrieve(self.docs, self.collection, vector)[0]["page"], 2)
        self.assertEqual(retrieve(self.docs, ObjectId(), vector), [])

    def test_delete_during_embedding_cannot_resurrect_passages(self):
        def delete_then_respond(request):
            self.docs.delete_one({"_id": self.id})
            return respond(request)

        model = Gemini(httpx.MockTransport(delete_then_respond), "test")
        self.addCleanup(model.client.close)
        index_next(self.docs, self.http, model)
        self.assertEqual(self.docs.count_documents({}), 0)

    def test_missing_key_is_actionable_and_retry_recovers(self):
        model = Gemini(key="")
        self.addCleanup(model.client.close)
        index_next(self.docs, self.http, model)
        doc = self.docs.find_one({})
        self.assertEqual(doc["indexStatus"], "failed")
        self.assertIn("chatbot-service/.env", doc["indexError"])
        self.docs.update_one({}, {"$set": {"indexStatus": "pending"}, "$unset": {"indexError": ""}})
        index_next(self.docs, self.http, self.model)
        self.assertEqual(self.docs.find_one({})["indexStatus"], "ready")

    def test_sources_must_reference_retrieved_passages(self):
        passage = {"documentId": str(self.id), "filename": "field-guide.pdf", "page": 2, "text": "Juniper"}
        grounded = self.model.answer("Which code?", [passage])
        self.assertEqual(grounded["sources"][0]["snippet"], passage["text"])
        self.assertEqual(grounded["sources"][0]["page"], 2)
        self.assertEqual(self.model.answer("What is the weather?", [passage])["answer"], UNSUPPORTED)
        invalid = {"statements": [{"text": "invented", "citations": [{"passage": 2, "quote": "unknown"}]}]}
        model = Gemini(httpx.MockTransport(lambda _: httpx.Response(200, json={
            "candidates": [{"content": {"parts": [{"text": json.dumps(invalid)}]}}]})), "test")
        self.addCleanup(model.client.close)
        with self.assertRaisesRegex(ChatError, "citation"):
            model.answer("Which code?", [passage])
