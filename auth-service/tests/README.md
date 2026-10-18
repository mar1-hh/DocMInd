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

Proxy deployment contract: client -> NGINX -> Auth. Express trusts exactly one
hop, and NGINX overwrites `X-Forwarded-For` and `X-Real-IP` with `$remote_addr`.
The Auth port is exposed only within Docker, never published to the host.
Do not publish port 3001 or put another proxy in front of NGINX without revisiting
this trust configuration. Containers on the network and the Docker host are
trusted; a direct caller of Auth could supply a forged forwarding header.

`npm test` also checks proxy hop trust, independent client rate-limit counters,
spoofed multi-address headers, and the NGINX header configuration. All tests use
the real 10-request limit; authentication tests reset only their local test
client's counter between cases.

For a real NGINX check, run:

```sh
node tests/gateway-smoke.mjs
```

This requires Docker and builds a separate disposable Compose project with two
client containers, the real Auth service, NGINX configuration, and MongoDB. It
validates `nginx -t`, tries rotating forged forwarding headers through NGINX,
checks a second client's independent counter, and exercises registration, login,
`/me`, refresh, and logout through the gateway. It also checks that the deployment
Compose file publishes no Auth port. No host ports, development database, or
`.env` secrets are used by the test containers; cleanup removes their containers,
network, and volumes even on test failure.
