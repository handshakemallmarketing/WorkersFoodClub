const FULL_GIT_SHA = /^[0-9a-f]{40}$/;

function evaluateProductionApplicationAccess(env = process.env) {
  if (env.PRODUCTION_APPLICATION_ACCESS_ENABLED !== 'true') {
    return {
      ok: false,
      status: 503,
      error: 'PRODUCTION_APPLICATION_ACCESS_DISABLED',
    };
  }

  // Exact-SHA authorization is a Production deployment boundary. Preview and
  // local test fixtures continue to exercise the access/auth stack without
  // impersonating a Vercel Production deployment.
  if (env.VERCEL_ENV !== 'production') {
    return { ok: true };
  }

  const authorizedSha = env.PRODUCTION_APPLICATION_ACCESS_AUTHORIZED_SHA;
  const runtimeSha = env.VERCEL_GIT_COMMIT_SHA;

  if (!FULL_GIT_SHA.test(authorizedSha ?? '') || !FULL_GIT_SHA.test(runtimeSha ?? '')) {
    return {
      ok: false,
      status: 503,
      error: 'PRODUCTION_APPLICATION_ACCESS_SHA_UNVERIFIED',
    };
  }

  if (runtimeSha !== authorizedSha) {
    return {
      ok: false,
      status: 503,
      error: 'PRODUCTION_APPLICATION_ACCESS_SHA_UNAUTHORIZED',
    };
  }

  return { ok: true };
}

export function productionApplicationAccessEnabled(env = process.env) {
  return evaluateProductionApplicationAccess(env).ok;
}

export function requireProductionApplicationAccess(env = process.env) {
  return evaluateProductionApplicationAccess(env);
}
