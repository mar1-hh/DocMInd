import { defineConfig, mergeConfig } from 'vite'
import config from './vite.config'

// Used only by Dockerfile.e2e. The normal development proxy stays untouched.
export default mergeConfig(config, defineConfig({
  plugins: [{
    name: 'docmind-e2e-environment',
    configureServer(server) {
      server.middlewares.use('/__e2e_environment', (_request, response) => {
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({ environment: 'docmind-auth-e2e', database: 'docmind_auth_e2e' }))
      })
    },
  }],
  server: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    proxy: {
      '/api/auth': { target: 'http://nginx', changeOrigin: true },
      '/health': { target: 'http://nginx', changeOrigin: true },
    },
  },
}))
