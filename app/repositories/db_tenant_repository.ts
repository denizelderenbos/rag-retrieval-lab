import type { Database } from '@adonisjs/lucid/database'
import type { Tenant } from '#domain/tenant'

/**
 * The tenants table has no RLS: it only holds names and the TUI has to show
 * them before a tenant is chosen. In a real system you would filter on the
 * tenants the signed-in user belongs to.
 */
export class DbTenantRepository {
  constructor(private readonly db: Database) {}

  async list(): Promise<Tenant[]> {
    return this.db.connection('app').from('tenants').select('id', 'name').orderBy('name')
  }
}
