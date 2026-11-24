# DocMind API

Use the [local setup instructions](../README.md#run-locally) to start the gateway and services.

## Authentication

DocMind uses the following session mechanisms.

- Short-lived JWT access tokens stored in frontend memory.
- Refresh tokens stored in HttpOnly cookies.
- Hashed refresh-token values stored in MongoDB.
- Refresh-token rotation.
- Expiration checks and a MongoDB TTL index for expired records.
- Cross-tab notifications and coordination for authentication changes.

The frontend restores sessions after reload and prevents a refresh from silently switching an authenticated tab to another account.

Logout deletes the refresh session and clears frontend authentication state. Already-issued access tokens may remain valid until expiry unless the backend separately enforces revocation.

### Auth endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Create an account |
| `POST` | `/api/auth/login` | Authenticate a user |
| `POST` | `/api/auth/refresh` | Refresh the access token and rotate the refresh token |
| `POST` | `/api/auth/logout` | End the refresh session |
| `GET` | `/api/auth/me` | Retrieve the authenticated user |
| `GET` | `/health` | Check service availability |

Refer to the route handlers and validation schemas for request fields and response formats.

## Collections and PDF API

Use the gateway at `http://localhost:8080`. Every request to `/api/collections`
requires `Authorization: Bearer <access token>`. Send JSON bodies with
`Content-Type: application/json`. The service verifies the token and uses its
`sub` as the owner. The only writable fields are `name` and `description`.

| Method and path | Request | Success |
|---|---|---|
| `POST /api/collections` | Required `name`, optional `description` | `201` with `{ "collection": ... }` |
| `GET /api/collections?page=1&limit=20` | Optional positive decimal integers | `200` with `{ "collections": [...], "page": 1, "limit": 20, "hasMore": false }` |
| `GET /api/collections/:id` | 24-character hexadecimal collection ID | `200` with `{ "collection": ... }` |
| `PATCH /api/collections/:id` | At least one writable field | `200` with the updated `{ "collection": ... }` |
| `DELETE /api/collections/:id` | Collection ID | `204` with an empty body |

Names are trimmed and must contain 1–100 characters after trimming. Descriptions
are strings up to 500 characters. Omit the description on creation to leave it
absent, or send an empty string to clear its text on update. Omitted fields on
PATCH retain their values. Listing returns only the caller's collections, ordered
by creation time descending, then ID descending for ties. Page defaults to 1
(maximum 10,000) and limit defaults to 20 (maximum 100). An empty page returns
`collections: []` and `hasMore: false`. New insertions can shift page boundaries.

A successful request for one collection returns the following shape.

```json
{
  "collection": {
    "id": "67a123456789abcdef000002",
    "name": "Research",
    "description": "Reading notes",
    "ownerId": "67a123456789abcdef000001",
    "createdAt": "2026-11-20T10:00:00.000Z",
    "updatedAt": "2026-11-20T10:00:00.000Z"
  }
}
```

Invalid fields (including a supplied `ownerId`), IDs, or query parameters return
`400` with `errors.formErrors` and `errors.fieldErrors`. Malformed JSON returns
`400 INVALID_JSON`. Missing, invalid, or expired access tokens return `401` with
`{ "code": "...", "message": "..." }`, using auth-service's `UNAUTHORIZED`,
`INVALID_TOKEN`, and `TOKEN_EXPIRED` codes. A missing or unowned collection
returns the same `404 COLLECTION_NOT_FOUND` response. Refresh through the
existing auth API when the access token expires.

### Try it in Postman

1. Start the stack with `docker compose up -d --build`. Set a Postman environment variable `baseUrl` to `http://localhost:8080`.
2. For a new user, POST `{{baseUrl}}/api/auth/register` with raw JSON `{"name":"Test User","email":"test@example.com","password":"example-password"}`. POST the email and password to `{{baseUrl}}/api/auth/login`. Copy the login response's `accesstoken` value to a local Postman variable named `accessToken`. The refresh endpoint spells the response field `accessToken`.
3. Set Authorization to **Bearer Token** with value `{{accessToken}}`. POST `{{baseUrl}}/api/collections` with raw JSON `{"name":"Research","description":"Reading notes"}`. Save the returned `collection.id` as `collectionId`.
4. GET `{{baseUrl}}/api/collections?page=1&limit=10`, then GET `{{baseUrl}}/api/collections/{{collectionId}}`. PATCH the same item URL with `{"name":"Archived research"}`.
5. DELETE the item URL and expect `204`. GET it again and expect `404`. To check ownership, use a second user's token on an existing first-user collection and expect the same `404`.

### Verify the collections backend

From `document-service/`, run `npm ci`, `npm test`, `npm run typecheck`, and
`npm run build`. The tests use Supertest and start their own MongoDB process.
The first run needs access to a MongoDB binary. From the repository root,
`node auth-service/tests/gateway-smoke.mjs` exercises auth and collections
through Nginx on a disposable Docker network with a test database.

## PDFs in a collection

Open a collection at [Collections](http://localhost:8080/collections) and choose **Upload documents**. Its page at `/collections/:id` shows filenames, upload dates, and actions to download or delete each file. Deleting the collection also deletes its PDFs.

All endpoints require the same bearer access token used by collection CRUD. The base path is `/api/collections/:collectionId/documents`.

| Method and path relative to the base | Request | Success |
|---|---|---|
| POST `/` | Multipart form data with one File field named `file` | `201` with `{ "document": ... }` |
| GET `/` | No body | `200` with `{ "documents": [...] }`, newest first |
| GET `/:documentId/download` | No body | `200 application/pdf` attachment with the original filename |
| DELETE `/:documentId` | No body | `204` |

Each document contains `id`, `collectionId`, `originalFilename`, `size` in bytes, `contentType`, and an ISO `uploadedAt` timestamp. Missing or inaccessible collections return `404 COLLECTION_NOT_FOUND`. A document outside the specified owned collection returns `404 DOCUMENT_NOT_FOUND`.

Uploads must declare `application/pdf`, start with a PDF version header, end with the PDF EOF marker, and be **10 MiB or smaller**. The service returns `400` for invalid files or multipart fields and `413` for oversized uploads. Nginx accepts up to 11 MiB for the whole request to allow room for multipart headers. In Postman select **Body → form-data**, choose **File** for the `file` field, and let Postman set the multipart boundary.

### Storage and recovery

MongoDB holds metadata in `docmind_documents`. The document service writes bytes under generated keys to `PDF_STORAGE_DIR` (default `./data/pdfs` outside Docker). Compose mounts the named `document_pdfs` volume at `/data/pdfs`. Back up the database and volume together. An ordinary container restart or replacement preserves both.

The Compose setup runs one document-service instance. It serializes file mutations per collection and rechecks ownership after receiving an upload. It records an upload before writing any bytes and publishes it after the write succeeds. For deletion it marks the document or collection first, then removes the files before their metadata. An I/O or database failure returns an error and leaves any unfinished work recorded. Before serving traffic on startup, the service discards incomplete uploads and finishes pending deletions. Retrying a deletion also finishes its pending cleanup. Ready documents in other collections remain available.

Run `npm --prefix document-service test` for ownership, validation, and storage recovery coverage. Run `make test-e2e` for the browser workflow through Nginx, including a byte-for-byte download after replacing the isolated document-service container.

## Collection chat

The Collections dashboard uses `GET /api/collections/dashboard?page=1&limit=9` for owner-scoped counts, indexing status, questions, and the three most recent uploads across all pages. Settings in the top navigation controls the persisted color mode.

### Chat API

Send `POST /api/chat` through Nginx with `Authorization: Bearer <access token>`, `Content-Type: application/json`, and a question of 1–2000 characters. The collection page sends the checked ready PDF IDs in `documentIds`. An empty selection is invalid. Every supplied ID must belong to a ready document in the owned collection. Omitting the field retains collection-wide search. For example, asking about one selected PDF can return the following response.

```json
{"collectionId":"67a123456789abcdef000002","documentIds":["67a123456789abcdef000003"],"question":"What is the project code name?"}
```

```json
{
  "answer": "The project code name is Juniper.",
  "statements": [
    { "text": "The project code name is Juniper.", "citations": [1] }
  ],
  "sources": [{
    "documentId": "67a123456789abcdef000003",
    "filename": "field-guide.pdf",
    "page": 2,
    "snippet": "The project code name is Juniper.",
    "highlight": "Juniper"
  }]
}
```

Chat checks ownership through document-service before retrieval. A missing or unowned collection returns `404`, an invalid session returns `401`, and a collection without ready PDFs returns `409 NO_READY_PDFS`. If retrieved passages do not support an answer, the response explains that with an empty sources array.

### Index lifecycle

Upload returns `201` as soon as the original PDF is saved. The document service wakes the worker over the internal Compose network. The worker also polls MongoDB for missed notifications, expired claims and previously uploaded PDFs. The list and upload responses include `indexStatus` (`pending`, `indexing`, `ready` or `failed`) and an optional `indexError`. Failed PDFs can still be downloaded. Use **Retry indexing** after fixing a key or quota issue. For a scanned PDF, upload a copy with selectable text. An owner can request a rebuild with `POST /api/collections/:id/documents/:documentId/index` (empty body, `202`).

The original bytes stay in document-service. Chatbot-service reads a PDF for its current job, splits its selectable text per page, and sends passage text with the filename to Gemini for embedding. It stores 768-dimensional embeddings and one-based page numbers with the document's collection ID, document ID, and filename in MongoDB. The worker publishes all passages in one conditional update, so a retry replaces the previous index and a late job cannot recreate a deleted PDF. The MVP supports up to 1,500 pages and 1,200 passages per PDF to keep the index within MongoDB's document limit.

Queries use [gemini-embedding-2](https://ai.google.dev/gemini-api/docs/embeddings) and cosine similarity across the selected ready documents in the owned collection. The question and up to five retrieved passages go to the configured answer model. Each source includes its stored passage in `snippet` and a verified verbatim `highlight` when available. Answer `statements` use one-based citation numbers into the returned `sources`. Open page links fetch the PDF through the authenticated download endpoint and position the viewer on that page.
