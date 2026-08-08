import { RENDERER_API_VERSION } from "./registry.js";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

const stable = (value) => JSON.stringify(canonical(value));

export function rendererConformance(definition, contract) {
  const errors = [];
  if (definition.apiVersion !== RENDERER_API_VERSION) errors.push(`apiVersion must be ${RENDERER_API_VERSION}`);
  ["key", "validateData", "prepare", "draw", "describe"].forEach((name) => { if (definition[name] == null) errors.push(`missing ${name}`); });
  let first, second;
  try { first = definition.prepare(contract); second = definition.prepare(contract); } catch (error) { errors.push(`prepare failed: ${error.message}`); }
  if (first !== undefined && stable(first) !== stable(second)) errors.push("prepare is not deterministic");
  try {
    const description = definition.describe(contract, first);
    if (!description || typeof description.summary !== "string" || !Array.isArray(description.headers) || !Array.isArray(description.rows)) errors.push("describe must return summary, headers, and rows");
  } catch (error) { errors.push(`describe failed: ${error.message}`); }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

export function assertRendererConformance(definition, contract) {
  const result = rendererConformance(definition, contract);
  if (!result.ok) throw new Error(`renderer ${definition.key ?? "unknown"} failed conformance: ${result.errors.join("; ")}`);
  return result;
}
