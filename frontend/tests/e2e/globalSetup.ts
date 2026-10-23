import { request } from '@playwright/test'

export default async function globalSetup() {
  const api = await request.newContext({ baseURL: 'http://127.0.0.1:4173' })
  try {
    const marker = await api.get('/__e2e_environment', { timeout: 10_000 })
    const environment: unknown = marker.ok() ? await marker.json() : null
    if (!environment || typeof environment !== 'object' || !('environment' in environment) || !('database' in environment) || environment.environment !== 'docmind-auth-e2e' || environment.database !== 'docmind_auth_e2e') {
      throw new Error('The isolated E2E environment marker is missing.')
    }
    const health = await api.get('/health', { timeout: 10_000 })
    if (!health.ok()) throw new Error('The E2E authentication gateway is not healthy.')
  } catch {
    throw new Error('E2E environment unavailable or unrecognized. Start the standalone docker-compose.e2e.yaml stack; see docs/testing/auth-e2e.md. No test users were created.')
  } finally {
    await api.dispose()
  }
}
