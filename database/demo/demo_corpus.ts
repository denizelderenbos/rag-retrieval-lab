import type { DocumentInput } from '#domain/document'

/**
 * Two tenants with deliberately overlapping topics and even a shared
 * identifier (SEC-2026-041). Every paragraph becomes one chunk.
 *
 * What it demonstrates is described in README.md, section "Demo".
 */
export const DEMO_CORPUS: { tenant: string; documents: DocumentInput[] }[] = [
  {
    tenant: 'Northwind Legal',
    documents: [
      {
        name: 'Security Policy',
        metadata: { category: 'security', owner: 'IT', classification: 'internal' },
        text: `
Security Policy SEC-2026-041 defines the procedure for handling confidential client files. Every file is classified as public, internal or confidential before it is shared outside the firm.

Passwords for the case management system must be at least 14 characters long. Multi-factor authentication is mandatory for remote access to client files.

Laptops are protected with full-disk encryption. A lost or stolen laptop must be reported to the IT desk within one hour.
`,
      },
      {
        name: 'Incident Response Manual',
        metadata: { category: 'security', owner: 'Security Officer', classification: 'internal' },
        text: `
Suspected compromise or leak of client authentication credentials: immediately revoke all active sessions of the affected account, force a password reset and notify the security officer. Record the timeline in the incident register.

When a client portal account shows unusual activity, the account is locked and the client is contacted by phone, never by email.

Major incidents are escalated to the managing partner within four hours. The data protection authority is informed within 72 hours when personal data is involved.

After every incident the team holds a review and updates the response procedure where needed.
`,
      },
      {
        name: 'Invoice Procedure',
        metadata: { category: 'finance', owner: 'Finance', classification: 'internal' },
        text: `
Invoice procedure INV-PROC-17: client invoices are issued on the first working day of the month and are payable within 30 days.

Disputed invoices are escalated to the responsible partner. No payment reminders are sent while a dispute is open.

Credit notes require approval from finance and must reference the original invoice number.
`,
      },
    ],
  },
  {
    tenant: 'Contoso Finance',
    documents: [
      {
        name: 'Expense Policy',
        metadata: { category: 'finance', owner: 'Controller', classification: 'internal' },
        text: `
Expense policy EXP-2026-008: employees submit receipts within 14 days. Expenses above 500 euro require approval from a manager.

Corporate card statements are reconciled every month. Personal expenses on a corporate card must be repaid within 30 days.

Security note: corporate card numbers and passwords are never shared by email or chat.
`,
      },
      {
        name: 'Quarterly Reporting Manual',
        metadata: { category: 'reporting', owner: 'CFO', classification: 'confidential' },
        text: `
Quarterly reports are prepared within ten working days after the quarter closes and are reviewed by the CFO.

Revenue figures in the quarterly report must match the general ledger. Differences above one percent are explained in a separate note.

Customer invoices that remain unpaid after 90 days are listed separately in the quarterly report.
`,
      },
      {
        name: 'Customer Onboarding Procedure',
        metadata: { category: 'operations', owner: 'Customer Desk', classification: 'internal' },
        text: `
Onboarding checklist SEC-2026-041 is the procedure for verifying the identity of new business customers before an account is opened.

Customer login credentials are sent in two separate messages. If a customer reports that their credentials may have leaked, the account is frozen and new credentials are issued after identity verification.

Customers receive their first invoice after onboarding is complete.
`,
      },
    ],
  },
]
