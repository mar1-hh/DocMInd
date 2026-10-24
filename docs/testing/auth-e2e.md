# Authentication end-to-end tests

These eight Playwright Chromium tests drive the real React UI through Vite → the existing Nginx configuration → the real Express auth-service → a dedicated MongoDB database. No API responses are mocked.

## Requirements

- Docker Desktop running, with Compose v2 supporting `up --wait`.
- Node 22.18+ and npm on the host.
- Port `4173` available. Development ports `5173`, `8080`, and `27017` can stay in use.
- Network access on first installation/build for npm, Chromium, and Docker images.

## Install the browser and test runner

From the repository root:

```sh
cd frontend
npm ci
npx playwright install chromium
cd ..
```

On Linux CI, use `npx playwright install --with-deps chromium` instead if browser system dependencies are missing.

## Run with Make

After installing the dependencies and Chromium above, run from the repository root:

```sh
make test-e2e
```

This creates a fresh isolated test stack, waits for health, runs all browser tests,
and removes the test stack even when startup or tests fail. Failures return a nonzero
exit status. Development containers and volumes are untouched.

Use `make e2e-list` to list tests without Docker. For manual inspection, `make e2e-up`
starts a fresh test stack and leaves it running; `make e2e-down` removes it.
The commands below describe the same workflow without Make.

## Start a fresh isolated environment

Run these commands from the repository root **before each full test run**, including reruns after a failure:

```sh
docker compose -f docker-compose.e2e.yaml down
docker compose -f docker-compose.e2e.yaml up --build --force-recreate --wait --wait-timeout 180
```

The standalone Compose file fixes its project name to `docmind-auth-e2e`. Do not combine it with `docker-compose.yaml`, override its project name, or supply development environment files. It has:

- Its own MongoDB container and `docmind_auth_e2e` database.
- Ephemeral `tmpfs` database storage, no development volumes, and no host MongoDB port.
- A test-only signing key and inline service environment, without loading `auth-service/.env`.
- Its own auth-service, Nginx, and frontend containers and project network.
- Only the frontend exposed, on `http://127.0.0.1:4173`.

Stopping/removing this stack discards its database. The existing development stack and data are untouched.

The test frontend uses `vite.e2e.config.ts`; normal development keeps `vite.config.ts`. The E2E-only frontend marker `/__e2e_environment` and proxied `/health` are checked before tests create any users. The Playwright base URL is deliberately fixed to this stack, not configurable to a development server. The marker is an accidental-target guard, not an authorization mechanism or a new backend endpoint.

## Run the tests

From the repository root:

```sh
cd frontend
npm run test:e2e
cd ..
```

The safe reporter prints each test's title, pass/fail status, and source line for failing steps. A nonzero exit code means setup or at least one test failed. Tests require the isolated stack to be running. Before each spec file, they verify its environment marker, restart only the test auth-service to clear its process-local rate-limit window, and wait for health. They never restart the development stack. If setup fails before tests run, check that the stack is healthy and that Chromium is installed:

```sh
docker compose -f docker-compose.e2e.yaml ps
```

To collect tests without running them:

```sh
cd frontend
npm run test:e2e:list
```

Other checks:

```sh
npm run lint
npm run typecheck:e2e
npm run build
npm test
```

## Stop and remove only the test environment

From the repository root:

```sh
docker compose -f docker-compose.e2e.yaml down
```

## Coverage and independence

1. Registration through the form returns a real 201, shows the creation confirmation, and leaves protected access denied until sign-in.
2. Login shows the actual user's account page; the session-check button successfully calls `/me`.
3. A registered user's incorrect password returns 401, displays the API error, and leaves the protected route inaccessible.
4. Reload restores the signed-in user, uses exactly one refresh request, and rotates the HttpOnly/SameSite Strict refresh cookie.
5. Logout returns 204, removes the refresh cookie, signs out another open tab without a reload, and prevents protected access after navigation and reload.
6. A fresh unauthenticated browser context is redirected from `/` to `/login`.
7. Alice and Bob sign in using two pages in the same browser context. Bob's login invalidates Alice's tab, and Alice's pending protected request is never retried as Bob. Bob's session remains valid after reload; no invalidation calls logout.
8. A rejected access token triggers same-user refresh, a `/me` identity check, and one safe retry; reload and a second page still restore that user.

The session-change tests replace only the first protected request's Authorization header with an invalid token to trigger a real 401. Refresh, identity lookup, retry, cookies, and all API responses use the real service.

Every test has its own browser context and unique UUID-based user credentials; no test relies on an account or browser state created by another test. Setup uses the UI, not direct database writes. There are no fixed sleeps: locators, response events, and Playwright assertions provide waiting.

The production rate limiter stays unchanged: ten combined registration/login attempts per IP per fifteen minutes. The original `auth.spec.ts` uses nine attempts and `session-change.spec.ts` uses six. The per-file test-service restart clears the process-local limiter between these groups, so the default full run works without weakening production limits. One worker and zero retries make that budget deterministic. **Recreate the test stack between complete runs**, and do not use `--repeat-each` or add browser projects without planning for the rate limit. The database is discarded with the stack, so no development records are ever cleaned up.

## Credentials and diagnostics

Tests never print passwords, cookies, or access tokens. Cookie assertions compare booleans rather than embedding cookie objects in assertion errors. Traces, videos, and screenshots are off because authentication diagnostics can contain secrets. The custom reporter prints titles, outcomes, and source locations, and removes Playwright's automatic error-context attachments. Generated test results are gitignored. Do not enable `DEBUG=pw:api`, network logging, trace recording, or alternate verbose reporters when sharing test output.

The safe reporter intentionally omits raw failure payloads. A failing test title identifies the scenario; inspect its accessible assertions in `frontend/tests/e2e/auth.spec.ts` and the test stack's health without collecting credential-bearing request dumps.

## Verified run

On 2026-10-23, the default `npm run test:e2e` command passed twice consecutively against the same Docker stack: each run had 8 passed, 0 failed, 0 skipped. Per-file auth-service restarts reset the test rate limiter automatically. Frontend lint, E2E TypeScript checking, the production build, and all eighteen frontend store tests (including identity mismatch and cross-tab login/logout race coverage) also passed. The build retains its existing advisory about the main JavaScript chunk exceeding 500 kB. The isolated stack was removed afterward; the development containers were left running.

Playwright references: [test configuration](https://playwright.dev/docs/test-configuration) and [CLI commands](https://playwright.dev/docs/test-cli).
