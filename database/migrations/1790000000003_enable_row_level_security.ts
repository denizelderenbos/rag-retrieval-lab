import env from '#start/env'
import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Tenant isolation in the database itself.
 *
 * The application sets `app.tenant_id` per transaction (see
 * TenantDatabaseSession). The policies below only show and accept rows whose
 * tenant_id equals that value. Without a tenant context
 * app_current_tenant_id() returns NULL, and `tenant_id = NULL` is never true:
 * the database fails closed instead of open.
 */
export default class extends BaseSchema {
  async up() {
    const appRole = quoteIdentifier(env.get('DB_APP_USER'))

    // current_setting(..., true) returns NULL if the setting was never set, but
    // an empty string if it was set earlier in this session with SET LOCAL.
    // NULLIF handles that second case, otherwise the cast to uuid fails.
    this.schema.raw(`
      CREATE OR REPLACE FUNCTION app_current_tenant_id() RETURNS uuid
      LANGUAGE sql STABLE
      AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$
    `)

    for (const table of ['documents', 'chunks']) {
      this.schema.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
      // FORCE: the table owner is subject to the policy too. Superusers and
      // roles with BYPASSRLS remain exempt, which is why the app runs as
      // rag_app.
      this.schema.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`)
      this.schema.raw(`
        CREATE POLICY ${table}_tenant_isolation ON ${table}
        USING (tenant_id = app_current_tenant_id())
        WITH CHECK (tenant_id = app_current_tenant_id())
      `)
    }

    this.schema.raw(`GRANT USAGE ON SCHEMA public TO ${appRole}`)
    // The tenant list is not secret in this demo (the TUI shows it). Creating
    // tenants is reserved for the admin role.
    this.schema.raw(`GRANT SELECT ON tenants TO ${appRole}`)
    this.schema.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON documents, chunks TO ${appRole}`)
  }

  async down() {
    const appRole = quoteIdentifier(env.get('DB_APP_USER'))

    this.schema.raw(`REVOKE ALL ON tenants, documents, chunks FROM ${appRole}`)
    this.schema.raw(`REVOKE USAGE ON SCHEMA public FROM ${appRole}`)
    for (const table of ['documents', 'chunks']) {
      this.schema.raw(`DROP POLICY IF EXISTS ${table}_tenant_isolation ON ${table}`)
      this.schema.raw(`ALTER TABLE ${table} NO FORCE ROW LEVEL SECURITY`)
      this.schema.raw(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`)
    }
    this.schema.raw('DROP FUNCTION IF EXISTS app_current_tenant_id()')
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`
}
