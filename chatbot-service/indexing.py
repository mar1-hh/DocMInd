import heapq
import io
import math
import struct
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from pymongo import ReturnDocument
from pypdf import PdfReader

from gemini import ChatError, DIMENSIONS

VECTOR = struct.Struct(f"<{DIMENSIONS}f")


def chunks(pdf):
    reader = PdfReader(io.BytesIO(pdf))
    if reader.is_encrypted:
        raise ChatError(422, "PDF_ENCRYPTED", "Upload an unlocked copy of this PDF.")
    if len(reader.pages) > 1500:
        raise ChatError(422, "PDF_TOO_LONG", "Split this PDF into smaller files before indexing.")
    passages = []
    for page, source in enumerate(reader.pages, 1):
        text = " ".join(source.extract_text().split())
        start = 0
        while start < len(text):
            end = min(start + 1200, len(text))
            if end < len(text):
                split = text.rfind(" ", start + 800, end)
                if split != -1:
                    end = split
            passages.append({"text": text[start:end], "page": page})
            # 1200 * (1200 Unicode chars + 768 float32s) fits one 16 MiB Mongo record.
            if len(passages) > 1200:
                raise ChatError(422, "PDF_TOO_LONG", "Split this PDF into smaller files before indexing.")
            if end == len(text):
                break
            start = end - 120
    if not passages:
        raise ChatError(422, "NO_SELECTABLE_TEXT", "No selectable text found. Upload a text-based or OCR-processed PDF.")
    return passages


def lease_expiry():
    return datetime.now(timezone.utc) + timedelta(minutes=3)


def index_next(db, http, model):
    attempt = str(uuid.uuid4())
    doc = db.find_one_and_update({
        "state": "ready", "$or": [{"indexStatus": {"$in": [None, "pending"]}},
                                  {"indexStatus": "indexing", "indexLease": {"$lt": datetime.now(timezone.utc)}}],
    }, {"$set": {"indexStatus": "indexing", "indexAttempt": attempt, "indexLease": lease_expiry()},
        "$unset": {"indexError": ""}}, projection={"originalFilename": 1}, return_document=ReturnDocument.AFTER)
    if doc is None:
        return False
    # Every write after claiming is conditional. A deleted, retried or reclaimed job cannot publish.
    claim = {"_id": doc["_id"], "state": "ready", "indexStatus": "indexing", "indexAttempt": attempt}
    try:
        response = http.get(f"/internal/index-files/{doc['_id']}", headers={"X-Index-Attempt": attempt})
        response.raise_for_status()
        try:
            passages = chunks(response.content)
        except ChatError:
            raise
        except Exception:
            raise ChatError(422, "PDF_UNREADABLE", "Could not read this PDF. Upload a readable, unlocked copy.") from None
        for start in range(0, len(passages), 16):
            if not db.update_one(claim, {"$set": {"indexLease": lease_expiry()}}).matched_count:
                return True
            batch = passages[start:start + 16]
            vectors = model.embed([f"title: {doc['originalFilename']} | text: {p['text']}" for p in batch])
            for passage, vector in zip(batch, vectors, strict=True):
                passage["embedding"] = VECTOR.pack(*vector)
        update = {"indexStatus": "ready", "indexPassages": passages}
    except ChatError as error:
        update = {"indexStatus": "failed", "indexError": error.message}
    except httpx.HTTPError:
        update = {"indexStatus": "failed", "indexError": "Could not fetch the PDF from document-service. Retry indexing."}
    db.update_one(claim, {"$set": update, "$unset": {"indexLease": "", "indexAttempt": ""}})
    return True


def retrieve(db, collection_id, vector, document_ids=None):
    norm = math.sqrt(sum(x*x for x in vector))
    def candidates():
        query = {"collectionId": collection_id, "state": "ready", "indexStatus": "ready"}
        if document_ids is not None:
            query["_id"] = {"$in": document_ids}
        for doc in db.find(query, {"originalFilename": 1, "indexPassages": 1}):
            for p in doc["indexPassages"]:
                embedding = VECTOR.unpack(p["embedding"])
                score = sum(x*y for x, y in zip(vector, embedding)) / (norm * math.sqrt(sum(x*x for x in embedding)))
                yield score, {"documentId": str(doc["_id"]), "filename": doc["originalFilename"],
                              "page": p["page"], "text": p["text"]}
    return [passage for _, passage in heapq.nlargest(5, candidates(), key=lambda item: item[0])]
