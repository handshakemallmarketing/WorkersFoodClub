export function productionApplicationAccessEnabled(env = process.env) {
  return env.PRODUCTION_APPLICATION_ACCESS_ENABLED === 'true';
}

export function requireProductionApplicationAccess(env = process.env) {
  if (!productionApplicationAccessEnabled(env)) {
    return {
      ok: false,
      status: 503,
      error: 'PRODUCTION_APPLICATION_ACCESS_DISABLED',
    };
  }
  return { ok: true };
}
