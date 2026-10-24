import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { setTimeout } from 'node:timers/promises'
import { request } from '@playwright/test'

// The real limiter is process-local. Reset only the isolated test service between
// files so the default full run stays within the production limit in each file.
export async function resetRateLimit() {
  const api = await request.newContext({ baseURL: 'http://127.0.0.1:4173' })
  try {
    const marker = await api.get('/__e2e_environment', { timeout: 10_000 })
    const environment: unknown = marker.ok() ? await marker.json() : null
    if (!environment || typeof environment !== 'object' || !('environment' in environment) || !('database' in environment) || environment.environment !== 'docmind-auth-e2e' || environment.database !== 'docmind_auth_e2e') {
      throw new Error('Refusing to reset an unrecognized E2E environment.')
    }
    const compose = fileURLToPath(new URL('../../../docker-compose.e2e.yaml', import.meta.url))
    try {
      await promisify(execFile)('docker', ['compose', '-f', compose, 'restart', '--no-deps', 'auth-service'], { timeout: 15_000 })
    } catch {
      throw new Error('Could not restart the isolated E2E auth service to reset its rate-limit window. Check Docker Desktop and docker-compose.e2e.yaml.')
    }
    // Native fetch avoids reporting expected transient health failures as failed
    // Playwright assertion steps while the restarted process is coming online.
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      const healthy = await fetch('http://127.0.0.1:4173/health', { signal: AbortSignal.timeout(2000) })
        .then((response) => response.ok, () => false)
      if (healthy) return
      await setTimeout(100)
    }
    throw new Error('The isolated E2E auth service did not recover after restarting.')
  } finally {
    await api.dispose()
  }
}
