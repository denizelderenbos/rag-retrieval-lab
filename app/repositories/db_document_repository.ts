import type { TenantTransaction } from '#infrastructure/database/tenant_database_session'

export class DbDocumentRepository {
  async insert(
    trx: TenantTransaction,
    document: { tenantId: string; name: string; metadata: Record<string, unknown> }
  ): Promise<string> {
    const [row] = await trx
      .table('documents')
      .insert({
        tenant_id: document.tenantId,
        name: document.name,
        metadata: JSON.stringify(document.metadata),
      })
      .returning('id')

    return row.id
  }
}
