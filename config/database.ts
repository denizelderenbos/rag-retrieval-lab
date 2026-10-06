import env from '#start/env'
import { defineConfig } from '@adonisjs/lucid'

/**
 * Two connections to the same database, with two different roles.
 *
 * - `app` is the runtime role. Not a superuser and not a table owner, so
 *   PostgreSQL always applies Row Level Security.
 * - `admin` owns the schema. Only for migrations and creating tenants. A
 *   superuser ignores RLS, so this connection must never be used in the
 *   retrieval pipeline.
 */
const connection = {
  host: env.get('DB_HOST'),
  port: env.get('DB_PORT'),
  database: env.get('DB_DATABASE'),
}

const dbConfig = defineConfig({
  connection: 'app',

  connections: {
    app: {
      client: 'pg',
      connection: {
        ...connection,
        user: env.get('DB_APP_USER'),
        password: env.get('DB_APP_PASSWORD').release(),
      },
      pool: { min: 0, max: env.get('DB_POOL_MAX', 10) },
    },

    admin: {
      client: 'pg',
      connection: {
        ...connection,
        user: env.get('DB_ADMIN_USER'),
        password: env.get('DB_ADMIN_PASSWORD').release(),
      },
      pool: { min: 0, max: 2 },
      migrations: {
        naturalSort: true,
        paths: ['database/migrations'],
      },
      seeders: {
        paths: ['database/seeders'],
      },
      // No Lucid models in this project, so no generated schema classes either.
      schemaGeneration: { enabled: false },
    },
  },
})

export default dbConfig
