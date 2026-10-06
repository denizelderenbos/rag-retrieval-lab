import type { Tenant } from '#domain/tenant'
import { type DbTenantRepository } from '#repositories/db_tenant_repository'

/** So the TUI only talks to services, also when picking a tenant. */
export class TenantService {
  constructor(private readonly tenants: DbTenantRepository) {}

  list(): Promise<Tenant[]> {
    return this.tenants.list()
  }
}
