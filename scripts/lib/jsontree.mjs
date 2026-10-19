/**
 * A JSON parser that keeps WHERE each value is, and accepts the JSONC that
 * editors write (`//` and block comments, trailing commas).
 *
 * PROVENANCE: ported line for line from the DeepSweep editor extension's
 * JSON parser (types removed, behaviour unchanged). A finding points at the line of the KEY that
 * holds it, so the parser has to know positions; `JSON.parse` does not.
 *
 * Strict everywhere else: anything that is not JSON-with-comments returns
 * `null` rather than a guess.
 *
 * Node shapes:
 *   { kind: 'object', offset, members: [{ key, keyOffset, keyLength, value }] }
 *   { kind: 'array', offset, items }
 *   { kind: 'string' | 'number' | 'boolean', offset, value }
 *   { kind: 'null', offset }
 */

/** Deeper nesting than this is refused, so a hostile file cannot exhaust the stack. */
const MAX_DEPTH = 256;

class ParseError extends Error {}

export function parseJsonTree(text) {
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const fail = () => { throw new ParseError(); };

  const skipTrivia = () => {
    for (;;) {
      const c = text[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      if (c === '/' && text[i + 1] === '/') {
        i += 2;
        while (i < text.length && text[i] !== '\n') { i++; }
        continue;
      }
      if (c === '/' && text[i + 1] === '*') {
        const end = text.indexOf('*/', i + 2);
        if (end < 0) { fail(); }
        i = end + 2;
        continue;
      }
      return;
    }
  };

  const parseString = () => {
    i++;
    let out = '';
    for (;;) {
      if (i >= text.length) { fail(); }
      const c = text[i];
      const code = text.charCodeAt(i);
      if (c === '"') { i++; return out; }
      if (code < 0x20) { fail(); }
      if (c !== '\\') { out += c; i++; continue; }
      const e = text[i + 1];
      i += 2;
      switch (e) {
        case '"': out += '"'; break;
        case '\\': out += '\\'; break;
        case '/': out += '/'; break;
        case 'b': out += '\b'; break;
        case 'f': out += '\f'; break;
        case 'n': out += '\n'; break;
        case 'r': out += '\r'; break;
        case 't': out += '\t'; break;
        case 'u': {
          const hex = text.slice(i, i + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) { fail(); }
          out += String.fromCharCode(parseInt(hex, 16));
          i += 4;
          break;
        }
        default: fail();
      }
    }
  };

  const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

  const parseValue = (depth) => {
    if (depth > MAX_DEPTH) { fail(); }
    skipTrivia();
    const offset = i;
    const c = text[i];
    if (c === '{') {
      i++;
      const members = [];
      skipTrivia();
      if (text[i] === '}') { i++; return { kind: 'object', offset, members }; }
      for (;;) {
        skipTrivia();
        if (text[i] !== '"') { fail(); }
        const keyOffset = i;
        const key = parseString();
        const keyLength = i - keyOffset;
        skipTrivia();
        if (text[i] !== ':') { fail(); }
        i++;
        const value = parseValue(depth + 1);
        members.push({ key, keyOffset, keyLength, value });
        skipTrivia();
        if (text[i] === ',') {
          i++;
          skipTrivia();
          if (text[i] === '}') { i++; return { kind: 'object', offset, members }; }
          continue;
        }
        if (text[i] === '}') { i++; return { kind: 'object', offset, members }; }
        fail();
      }
    }
    if (c === '[') {
      i++;
      const items = [];
      skipTrivia();
      if (text[i] === ']') { i++; return { kind: 'array', offset, items }; }
      for (;;) {
        items.push(parseValue(depth + 1));
        skipTrivia();
        if (text[i] === ',') {
          i++;
          skipTrivia();
          if (text[i] === ']') { i++; return { kind: 'array', offset, items }; }
          continue;
        }
        if (text[i] === ']') { i++; return { kind: 'array', offset, items }; }
        fail();
      }
    }
    if (c === '"') { return { kind: 'string', offset, value: parseString() }; }
    if (text.startsWith('true', i)) { i += 4; return { kind: 'boolean', offset, value: true }; }
    if (text.startsWith('false', i)) { i += 5; return { kind: 'boolean', offset, value: false }; }
    if (text.startsWith('null', i)) { i += 4; return { kind: 'null', offset }; }
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(text);
    if (m && m[0].length > 0) {
      i += m[0].length;
      return { kind: 'number', offset, value: Number(m[0]) };
    }
    return fail();
  };

  try {
    const root = parseValue(0);
    skipTrivia();
    if (i !== text.length) { return null; }
    return root;
  } catch (err) {
    if (err instanceof ParseError || err instanceof RangeError) { return null; }
    throw err;
  }
}

/** The member named `key` (the LAST one, as `JSON.parse` resolves duplicates). */
export function memberOf(node, key) {
  if (!node || node.kind !== 'object') { return undefined; }
  for (let k = node.members.length - 1; k >= 0; k--) {
    if (node.members[k].key === key) { return node.members[k].value; }
  }
  return undefined;
}

/** The member record named `key` (key position included), last one wins. */
export function memberNamed(node, key) {
  if (!node || node.kind !== 'object') { return undefined; }
  for (let k = node.members.length - 1; k >= 0; k--) {
    if (node.members[k].key === key) { return node.members[k]; }
  }
  return undefined;
}

/** String items of an array node, with each item's offset. */
export function stringItems(node) {
  if (!node || node.kind !== 'array') { return []; }
  return node.items.filter((n) => n.kind === 'string').map((n) => ({ value: n.value, offset: n.offset }));
}

/** One-based line of `offset` in `text`. */
export function lineOf(text, offset) {
  let line = 1;
  for (let k = 0; k < offset && k < text.length; k++) {
    if (text.charCodeAt(k) === 10) { line++; }
  }
  return line;
}
