import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from threading import Event, Thread

import httpx
from bson import ObjectId
from fastapi import FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from typing import Annotated
from pymongo import MongoClient
from pymongo.errors import PyMongoError

from gemini import ChatError, Gemini
from indexing import index_next, retrieve


class Question(BaseModel):
    model_config = ConfigDict(extra="forbid")
    collectionId: str = Field(pattern=r"^[0-9a-fA-F]{24}$")
    documentIds: list[Annotated[str, StringConstraints(pattern=r"^[0-9a-fA-F]{24}$")]] | None = Field(default=None, min_length=1)
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


def create_app(model_factory=Gemini):
    wake, stop = Event(), Event()

    @asynccontextmanager
    async def lifespan(app):
        mongo = MongoClient(os.environ["MONGO_URI"], serverSelectionTimeoutMS=5000)
        db = mongo.get_default_database().documents
        http = httpx.Client(base_url=os.environ["DOCUMENT_SERVICE_URL"], timeout=15)
        model = model_factory()
        app.state.documents, app.state.http, app.state.model = db, http, model

        def worker():
            while not stop.is_set():
                wake.clear()
                try:
                    if index_next(db, http, model):
                        continue
                except Exception:
                    # An unfinished claim expires and can be recovered after a transient failure.
                    logging.error("Index worker interrupted; pending work will be retried")
                wake.wait(5)

        thread = Thread(target=worker, daemon=True)
        thread.start()
        try:
            yield
        finally:
            stop.set()
            wake.set()
            thread.join(timeout=50)
            http.close()
            model.client.close()
            mongo.close()

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    @app.exception_handler(RequestValidationError)
    async def invalid_question(_request: Request, _error: RequestValidationError):
        return JSONResponse({"code": "INVALID_QUESTION", "message": "Provide a collection ID and a question of 1–2000 characters."}, status_code=400)

    @app.exception_handler(ChatError)
    async def chat_error(_request: Request, error: ChatError):
        return JSONResponse({"code": error.code, "message": error.message}, status_code=error.status)

    @app.exception_handler(PyMongoError)
    async def database_error(_request: Request, _error: PyMongoError):
        return JSONResponse({"code": "DATABASE_UNAVAILABLE", "message": "The search index is unavailable. Please retry."}, status_code=503)

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.post("/internal/index", status_code=202)
    def notify():
        wake.set()
        return {"queued": True}

    def authorize(collection_id, authorization):
        try:
            response = app.state.http.get(f"/api/collections/{collection_id}", headers={"Authorization": authorization or ""})
            if response.status_code in (401, 404):
                body = response.json()
                raise ChatError(response.status_code, body["code"], body["message"])
            response.raise_for_status()
            return response.json()["collection"]
        except httpx.HTTPError:
            raise ChatError(503, "PERMISSIONS_UNAVAILABLE", "Could not verify collection access. Please retry.") from None

    @app.post("/api/chat")
    def chat(body: Question, authorization: str | None = Header(default=None)):
        collection = authorize(body.collectionId, authorization)
        asked_at = datetime.now(timezone.utc)
        db, model = app.state.documents, app.state.model
        ready = {"collectionId": ObjectId(body.collectionId), "state": "ready", "indexStatus": "ready"}
        selected = None
        if body.documentIds is not None:
            selected = list({ObjectId(value) for value in body.documentIds})
            if db.count_documents({**ready, "_id": {"$in": selected}}) != len(selected):
                raise ChatError(409, "INVALID_SELECTION", "The selected PDFs are no longer available. Refresh the document list.")
        if not db.find_one(ready, {"_id": 1}):
            raise ChatError(409, "NO_READY_PDFS", "Upload a text-based PDF and wait for indexing to finish.")
        vector, = model.embed([f"task: question answering | query: {body.question}"])
        passages = retrieve(db, ready["collectionId"], vector, selected)
        if not passages:
            raise ChatError(409, "NO_READY_PDFS", "No ready PDFs remain in this collection.")
        answer = model.answer(body.question, passages)
        authorize(body.collectionId, authorization)
        used = {ObjectId(p["documentId"]) for p in passages}
        if db.count_documents({**ready, "_id": {"$in": list(used)}}) != len(used):
            raise ChatError(409, "COLLECTION_CHANGED", "The collection changed while answering. Please ask again.")
        db.database.collections.update_one(
            {"_id": ready["collectionId"], "ownerId": ObjectId(collection["ownerId"]), "deleting": {"$ne": True},
             "$or": [{"latestChat.at": {"$exists": False}}, {"latestChat.at": {"$lte": asked_at}}]},
            {"$set": {"latestChat": {"question": body.question, "at": asked_at, "reply": answer}}},
        )
        return answer

    return app


app = create_app()
