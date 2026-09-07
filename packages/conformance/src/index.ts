export const BASELINE='CB-00-v0.1' as const;
export function constitutionalFail(id:string, reason:string): never { throw new Error(`${id}: ${reason}`); }
