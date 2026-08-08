export const RENDERER_API_VERSION = "1";

export function defineRenderer(definition) {
  if (!definition || typeof definition !== "object") throw new TypeError("renderer definition must be an object");
  if (typeof definition.key !== "string" || !definition.key.trim()) throw new TypeError("renderer.key must be a non-empty string");
  if (definition.apiVersion !== RENDERER_API_VERSION) throw new TypeError(`renderer ${definition.key} requires apiVersion ${RENDERER_API_VERSION}`);
  ["validateData", "prepare", "draw", "describe"].forEach((method) => {
    if (typeof definition[method] !== "function") throw new TypeError(`renderer ${definition.key}.${method} must be a function`);
  });
  return Object.freeze({ family: "other", domains: () => ({}), ...definition });
}

export function createRendererRegistry(definitions = []) {
  const entries = new Map();
  definitions.forEach((candidate) => {
    const definition = defineRenderer(candidate);
    if (entries.has(definition.key)) throw new TypeError(`duplicate renderer key ${definition.key}`);
    entries.set(definition.key, definition);
  });
  const api = {
    apiVersion: RENDERER_API_VERSION,
    get(key) { return entries.get(key) ?? null; },
    has(key) { return entries.has(key); },
    keys() { return Object.freeze([...entries.keys()]); },
    definitions() { return Object.freeze([...entries.values()]); },
    with(...more) { return createRendererRegistry([...entries.values(), ...more.flat()]); },
  };
  return Object.freeze(api);
}
