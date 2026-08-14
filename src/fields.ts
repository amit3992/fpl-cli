/**
 * Field filtering — limit JSON output to requested fields.
 * Usage: --fields "name,price,form"
 *
 * One-level dotted paths are supported for nested arrays/objects:
 *   --fields "squad.name,squad.price,flagged.name"
 * Groups keys by prefix; applies sub-keys to each element of the array (or object)
 * at that key. Plain keys without dots keep current behaviour.
 */

type Obj = Record<string, unknown>;

function pickFields(obj: Obj, keys: string[]): Obj {
  const result: Obj = {};
  for (const key of keys) {
    if (Object.hasOwn(obj, key)) result[key] = obj[key];
  }
  return result;
}

export function filterFields<T>(data: T, fields?: string): T {
  if (!fields) return data;

  const keys = fields.split(",").map((f) => f.trim()).filter(Boolean);
  if (keys.length === 0) return data;

  // Fast path: no dotted keys — keep original behaviour
  const hasDots = keys.some((k) => k.includes("."));
  if (!hasDots) {
    if (Array.isArray(data)) {
      return data.map((item) => pickFields(item as Obj, keys)) as T;
    }
    if (typeof data === "object" && data !== null) {
      return pickFields(data as Obj, keys) as T;
    }
    return data;
  }

  // Dotted path support: only meaningful for a top-level object
  if (typeof data !== "object" || data === null || Array.isArray(data)) return data;

  const plainKeys: string[] = [];
  const groups = new Map<string, string[]>();

  for (const key of keys) {
    const dot = key.indexOf(".");
    if (dot === -1) {
      plainKeys.push(key);
    } else {
      const prefix = key.slice(0, dot);
      const suffix = key.slice(dot + 1);
      const list = groups.get(prefix) ?? [];
      list.push(suffix);
      groups.set(prefix, list);
    }
  }

  const result: Obj = {};
  const obj = data as Obj;

  for (const key of plainKeys) {
    if (Object.hasOwn(obj, key)) result[key] = obj[key];
  }

  for (const [prefix, suffixes] of groups) {
    if (Object.hasOwn(obj, prefix)) {
      const value = obj[prefix];
      if (Array.isArray(value)) {
        result[prefix] = value.map((item) => pickFields(item as Obj, suffixes));
      } else if (typeof value === "object" && value !== null) {
        result[prefix] = pickFields(value as Obj, suffixes);
      } else {
        result[prefix] = value;
      }
    }
  }

  return result as T;
}
