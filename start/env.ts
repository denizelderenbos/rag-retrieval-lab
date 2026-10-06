/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| Validates the environment variables at boot. A missing or invalid value
| makes the application fail immediately instead of halfway through a query.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  LOG_LEVEL: Env.schema.string(),
  APP_KEY: Env.schema.secret(),

  // Database: one host, two roles. See README, section "Row Level Security".
  DB_HOST: Env.schema.string({ format: 'host' }),
  DB_PORT: Env.schema.number(),
  DB_DATABASE: Env.schema.string(),
  DB_APP_USER: Env.schema.string(),
  DB_APP_PASSWORD: Env.schema.secret(),
  DB_ADMIN_USER: Env.schema.string(),
  DB_ADMIN_PASSWORD: Env.schema.secret(),
  DB_POOL_MAX: Env.schema.number.optional(),

  // Retrieval
  EMBEDDING_DIMENSIONS: Env.schema.number(),
})
