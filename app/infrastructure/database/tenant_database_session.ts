import type { Database } from '@adonisjs/lucid/database'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { InvalidTenantIdError } from '#domain/errors'

declare const tenantScoped: unique symbol

/**
 * A database transaction in which app.tenant_id has been set.
 *
 * The brand only exists for the type checker: a plain transaction does not fit
 * this type. Repositories that require a TenantTransaction can therefore only
 * be called from within runAsTenant.
 */
export type TenantTransaction = TransactionClientContract & { readonly [tenantScoped]: true }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class TenantDatabaseSession {
  constructor(
    private readonly db: Database,
    private readonly connectionName: string = 'app'
  ) {}

  /**
   * Runs `callback` inside a transaction that acts as `tenantId`.
   *
   * The tenant context is transaction-local. It disappears on commit or
   * rollback, so a connection that goes back into the pool does not carry a
   * tenant over to the next user. A plain `SET` (without LOCAL) would stick to
   * the connection.
   */
  async runAsTenant<T>(
    tenantId: string,
    callback: (trx: TenantTransaction) => Promise<T>
  ): Promise<T> {
    if (!UUID_PATTERN.test(tenantId)) {
      throw new InvalidTenantIdError(tenantId)
    }

    return this.db.connection(this.connectionName).transaction(async (trx) => {
      // set_config(name, value, true) is the same as SET LOCAL, but as a
      // function. SET LOCAL does not accept bind parameters; set_config does,
      // so the tenant id never reaches the SQL through string interpolation.
      await trx.rawQuery("SELECT set_config('app.tenant_id', ?, true)", [tenantId])

      return callback(trx as TenantTransaction)
    })
  }
}
