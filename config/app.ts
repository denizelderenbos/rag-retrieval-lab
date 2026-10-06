import { defineConfig } from '@adonisjs/core/http'

/**
 * This project runs no HTTP server, but the AdonisJS app provider always
 * builds the server object and reads this config to do so. The defaults are
 * fine.
 */
export const http = defineConfig({})
