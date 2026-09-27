export function selectCanonicalVercelStatus(statuses, targetPrefix) {
  if (!Array.isArray(statuses)) {
    throw new TypeError('statuses must be an array');
  }
  if (typeof targetPrefix !== 'string' || !targetPrefix.startsWith('https://vercel.com/') || !targetPrefix.endsWith('/')) {
    throw new Error('EXPECTED_VERCEL_TARGET_PREFIX must be an exact https://vercel.com/.../ prefix ending in /');
  }

  return statuses.find((status) => {
    const context = typeof status?.context === 'string' ? status.context : '';
    const targetUrl = typeof status?.target_url === 'string' ? status.target_url : '';
    return /^Vercel(?:\s|$|\u2013|-)/.test(context) && targetUrl.startsWith(targetPrefix);
  }) ?? null;
}
