import { assert } from '@japa/assert'
import app from '@adonisjs/core/services/app'
import type { Config } from '@japa/runner/types'
import { pluginAdonisJS } from '@japa/plugin-adonisjs'
import testUtils from '@adonisjs/core/services/test_utils'

/**
 * This file is imported by bin/test.ts.
 */

export const plugins: Config['plugins'] = [assert(), pluginAdonisJS(app)]

/**
 * Before all tests: run the migrations on the test database (rag_lab_test) as
 * the admin role. They are rolled back afterwards.
 */
export const runnerHooks: Required<Pick<Config, 'setup' | 'teardown'>> = {
  setup: [() => testUtils.db('admin').migrate()],
  teardown: [],
}

export const configureSuite: Config['configureSuite'] = () => {}
