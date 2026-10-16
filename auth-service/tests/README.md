# Auth API integration tests

Run from `auth-service`:

```sh
npm ci
npm test
npm run typecheck
```

Tests use Supertest against the exported Express app, real authentication code,
and a disposable MongoDB process managed by `mongodb-memory-server`. The first
run needs network access to download a MongoDB binary. No external MongoDB or
Docker service is required.

The suite does not load `.env` or read `MONGO_URI`. It connects exclusively to
its own `docmind_auth_test` database on the disposable server. Collections are
cleared before each test; teardown drops that database, disconnects Mongoose,
and stops the server. Tests run sequentially to isolate database mutations.
`tsconfig.test.json` extends the project's strict NodeNext/ESM configuration;
`npm run typecheck` checks both production and test code without emitting files.

Authentication failures are expected to return HTTP 401. Login exposes its
access token as `accesstoken`, while refresh uses `accessToken`; the tests follow
those existing response shapes.

Refresh coverage asserts that rotation preserves the consumed hash in
`usedTokenHashes`, replay sets `revokedAt`, and the successor is then rejected
without affecting another login session. Concurrent requests using the same
cookie must produce exactly one HTTP 200 and otherwise HTTP 401, preserve only
one consumed hash, and leave the session revoked. Logout currently deletes the
target session; tests verify its cookie can no longer refresh and a separate
session remains active.

The refresh response cookie must match the successor hash stored in MongoDB.
Login waits for session persistence before responding so immediate refresh
requests can find the session.
