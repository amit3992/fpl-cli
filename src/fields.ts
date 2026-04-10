/**
 * Field filtering — limit JSON output to requested fields.
 * Usage: --fields "name,price,form"
 */

type Obj = Record<string, unknown>;

function pickFields(obj: Obj, keys: string[]): Obj {
  const result: Obj = {};
  for (const key of keys) {
    if (key in obj) result[key] = obj[key];
  }
  return result;
}

export function filterFields<T>(data: T, fields?: string): T {
  if (!fields) return data;

  const keys = fields.split(",").map((f) => f.trim()).filter(Boolean);
  if (keys.length === 0) return data;

  if (Array.isArray(data)) {
    return data.map((item) => pickFields(item as Obj, keys)) as T;
  }

  if (typeof data === "object" && data !== null) {
    return pickFields(data as Obj, keys) as T;
  }

  return data;
}
