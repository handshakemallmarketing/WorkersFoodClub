import { randomUUID } from 'node:crypto';

const KIND_RE = /^[a-z][a-z0-9-]{0,39}$/;

export function runtimeEnvironment(env = process.env) {
  if (env.VERCEL_ENV === 'production') return 'production';
  if (env.VERCEL_ENV === 'preview') return 'preview';
  if (env.VERCEL_ENV === 'development') return 'development';
  return 'local';
}

export function durableId(kind, uuid = randomUUID()) {
  if (!KIND_RE.test(kind)) throw new Error('DURABLE_ID_KIND_INVALID');
  if (typeof uuid !== 'string' || uuid.length === 0) throw new Error('DURABLE_ID_UUID_INVALID');
  return `wfc:${kind}:${uuid}`;
}

export function runtimeOwnerToken(environment = runtimeEnvironment()) {
  if (!['production', 'preview', 'development', 'local'].includes(environment)) {
    throw new Error('RUNTIME_ENVIRONMENT_INVALID');
  }
  return `wfc-runtime:${environment}`;
}

export function canonicalRuntimeMetadata({ principal, environment = runtimeEnvironment() } = {}) {
  if (!principal || typeof principal.actorId !== 'string' || principal.actorId.length === 0) {
    throw new Error('CANONICAL_ACTOR_REQUIRED');
  }
  if (!['production', 'preview', 'development', 'local'].includes(environment)) {
    throw new Error('RUNTIME_ENVIRONMENT_INVALID');
  }
  return Object.freeze({
    actorId: principal.actorId,
    environment,
  });
}
