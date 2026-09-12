import { productionApplicationAccessEnabled } from '../lib/production-access-policy.js';
import { readProductionOidcConfig } from '../lib/production-oidc-auth.js';

function configured(value) {
  return typeof value === 'string' && value.length > 0;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  res.setHeader('Cache-Control', 'no-store');

  const environment = process.env.VERCEL_ENV || 'unknown';
  const production = environment === 'production';
  const oidc = readProductionOidcConfig(process.env);
  const databaseConfigured = configured(process.env.DATABASE_URL);
  const accessEnabled = production && productionApplicationAccessEnabled(process.env);

  return res.status(200).json({
    ok: true,
    environment,
    authenticationMode: production ? 'OIDC' : 'PREVIEW',
    productionApplicationAccessEnabled: accessEnabled,
    oidcConfigured: oidc.ok === true,
    applicationBindingStoreConfigured: databaseConfigured,
    identityRuntimeReady: production
      ? oidc.ok === true && databaseConfigured && accessEnabled
      : true,
    liveFundsAuthorized: false,
  });
}
