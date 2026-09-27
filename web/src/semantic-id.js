// Injective component encoding. Separators remain outside the encoded component.
// Lone UTF-16 surrogates use a disjoint ~uXXXX escape rather than replacement.
export function encodeIdComponent(value) {
  let result = '';
  for (const char of String(value)) {
    if (/^[A-Za-z0-9_.-]$/.test(char)) result += char;
    else if (char.length === 1 && char.charCodeAt(0) >= 0xD800 && char.charCodeAt(0) <= 0xDFFF)
      result += `~u${char.charCodeAt(0).toString(16).toUpperCase()}`;
    else for (const byte of new TextEncoder().encode(char)) result += `~${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return result;
}
