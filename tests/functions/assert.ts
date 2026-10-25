import a from "node:assert/strict";
export const assert = (v: unknown, msg?: string) => a.ok(v, msg);
export const assertEquals = (x: unknown, y: unknown, msg?: string) => a.deepStrictEqual(x, y, msg);
export const assertMatch = (s: string, re: RegExp) => a.match(s, re);
