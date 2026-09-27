import { annualFeeMinor } from './membership-annual-invoice.js';

/** Resolves the current annual membership fee: the admin-editable
 * membership_fee_configuration row if one is active, else the legacy
 * ANNUAL_MEMBERSHIP_FEE_MINOR env var, else null (unconfigured). Never
 * throws -- callers decide how to handle an unconfigured fee. */
export async function resolveAnnualFeeMinor({ sql, env = process.env }) {
  if (sql) {
    const rows = await sql`SELECT amount_minor, currency FROM membership_fee_configuration WHERE currency='GHS' AND active=true LIMIT 1`;
    if (rows.length === 1) return { amountMinor: Number(rows[0].amount_minor), currency: String(rows[0].currency), source: 'ADMIN_CONFIGURED' };
  }
  const envFee = annualFeeMinor(env);
  if (envFee !== null) return { amountMinor: envFee, currency: 'GHS', source: 'ENV_FALLBACK' };
  return null;
}
