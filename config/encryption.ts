import env from '#start/env'
import { defineConfig, drivers } from '@adonisjs/core/encryption'

/**
 * Not used by the retrieval pipeline, but AdonisJS expects an encryption
 * config at boot.
 */
export default defineConfig({
  default: 'app',
  list: {
    app: drivers.aes256gcm({
      id: 'app',
      keys: [env.get('APP_KEY')],
    }),
  },
})
