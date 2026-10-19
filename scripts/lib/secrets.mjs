/**
 * Credentials written in plain text into files an agent reads: where they are
 * and what kind they look like, never what they are.
 *
 * PROVENANCE: the classification helpers below (value shapes, references,
 * placeholders, secret-sounding names, URL and auth-scheme checks, and the
 * per-server env/headers/url/args walk) are ported from the DeepSweep editor
 * extension's config-secret rules, types removed.
 * Two deliberate differences, both narrowing what is read:
 *   - `~/.claude.json` is walked only for its user-scope server map and the
 *     CURRENT project's entry; other projects' entries are never visited.
 *   - instruction files (CLAUDE.md, AGENTS.md, ...) are prose, so they get a
 *     line scan for known token formats, private keys and passwords inside URLs
 *     (`findInstructionSecrets`), never the name-based rule.
 *
 * A finding carries a location, a line, the server and key names and the kind
 * of credential. The value is read to classify it and dropped in the same
 * function: no finding or message can hold it.
 */

const VALUE_SHAPES = [
  [/^gh[pousr]_[A-Za-z0-9]{30,}$/, 'GitHub token'],
  [/^github_pat_[A-Za-z0-9_]{30,}$/, 'GitHub token'],
  [/^glpat-[A-Za-z0-9_-]{20,}$/, 'GitLab token'],
  // Anthropic before OpenAI: both start with `sk-`.
  [/^sk-ant-[A-Za-z0-9_-]{20,}$/, 'Anthropic API key'],
  [/^sk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}$/, 'OpenAI API key'],
  [/^xox[abposr]-[A-Za-z0-9-]{10,}$/, 'Slack token'],
  [/^xapp-[0-9]+-[A-Za-z0-9-]{10,}$/, 'Slack token'],
  [/^xoxe(?:\.xox[abp])?-[0-9]+-[A-Za-z0-9-]{10,}$/, 'Slack token'],
  [/^(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}$/, 'AWS access key'],
  [/^AIza[0-9A-Za-z_-]{35}$/, 'Google API key'],
  [/^(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}$/, 'Stripe key'],
  [/^npm_[A-Za-z0-9]{36}$/, 'npm token'],
  [/^hf_[A-Za-z0-9]{30,}$/, 'Hugging Face token'],
];

const PRIVATE_KEY = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/;

const SECRET_STORE_SCHEME =
  /^(?:op|keychain|keyring|vault|sops|doppler|infisical|bws|bitwarden|lastpass|1password|secretsmanager|aws-?sm|ssm|gcp-?sm|gsm|akv|azure-?kv|azure-key-vault):(?:\/\/)?\S+$/i;

/** How a value refers to a secret kept somewhere else. Never a finding. WHOLE-VALUE only. */
export function isReference(value) {
  const t = value.trim();
  return (
    /^\$\{[^}]*\}$/.test(t) ||
    /^\$[A-Za-z_][A-Za-z0-9_]*$/.test(t) ||
    /^%[A-Za-z_][A-Za-z0-9_]*%$/.test(t) ||
    /^\{\{[^}]*\}\}$/.test(t) ||
    /^\{env:[^}]+\}$/i.test(t) ||
    /^env:[A-Za-z_][A-Za-z0-9_]*$/.test(t) ||
    SECRET_STORE_SCHEME.test(t) ||
    /^arn:aws[a-z-]*:(?:secretsmanager|ssm|kms):\S+$/i.test(t) ||
    /^projects\/[^/\s]+\/secrets\/[^/\s]+(?:\/versions\/[^/\s]+)?$/.test(t) ||
    /^@Microsoft\.KeyVault\(.*\)$/i.test(t)
  );
}

/** A value that is a template: some of it is filled in from elsewhere (linear scan). */
function containsReference(value) {
  const open = value.indexOf('${');
  if (open !== -1 && value.indexOf('}', open + 2) !== -1) { return true; }
  if (hasDoubleBraceTemplate(value)) { return true; }
  return /%[A-Za-z_][A-Za-z0-9_]*%/.test(value);
}

function hasDoubleBraceTemplate(value) {
  let pending = false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '}') {
      if (pending && value[i + 1] === '}') { return true; }
      pending = false;
    } else if (c === '{' && value[i + 1] === '{') {
      pending = true;
    }
  }
  return false;
}

/** A value someone left to be filled in. Never a finding. */
export function isPlaceholder(value) {
  const t = value.trim();
  return (
    /^<[^<>]*>$/.test(t) ||
    /^\[[^[\]]*\]$/.test(t) ||
    /(.)\1{7,}/.test(t) ||
    t.includes('...') ||
    t.includes('…') ||
    /\b(?:your|my)[-_ ]?[a-z0-9_ -]{0,64}(?:key|token|secret|password|pat)(?:[-_ ]?here)?\b/i.test(t) ||
    /^[a-z0-9 _-]{0,64}[-_ ](?:here|goes[-_ ]here)$/i.test(t) ||
    /(?:placeholder|example|redacted|replace[-_ ]?with|insert[-_ ]?(?:your|here))/i.test(t) ||
    /^(?:changeme|change[-_ ]?me|replace[-_ ]?me|todo|tbd|none|null|undefined|dummy|secret|password|token|test|demo|sample)$/i.test(t)
  );
}

const MAX_SHAPE_LENGTH = 4096;

export function valueShapeKind(value) {
  const t = value.trim();
  if (PRIVATE_KEY.test(t)) { return 'private key'; }
  if (t.length > MAX_SHAPE_LENGTH || /\s/.test(t)) { return null; }
  if (isPlaceholder(t)) { return null; }
  for (const [shape, kind] of VALUE_SHAPES) {
    if (shape.test(t)) { return kind; }
  }
  return null;
}

const SECRET_WORDS = new Set([
  'token', 'secret', 'password', 'passwd', 'pwd', 'passphrase', 'credential', 'credentials',
  'auth', 'authorization', 'bearer', 'pat', 'apikey', 'cookie',
]);
const SECRET_PAIRS = new Set([
  'api key', 'access key', 'private key', 'client secret', 'secret key', 'session key',
  'signing key', 'master key', 'account key', 'service key',
]);
const NOT_THE_SECRET = new Set([
  'url', 'uri', 'endpoint', 'host', 'hostname', 'domain', 'type', 'mode', 'method', 'file',
  'path', 'dir', 'directory', 'issuer', 'scope', 'scopes', 'header', 'name', 'id', 'enabled',
  'expiry', 'expires', 'ttl', 'timeout', 'provider', 'version', 'prefix', 'region', 'user',
  'username', 'email', 'port', 'kind', 'format', 'audience', 'realm', 'strategy',
  'encoding', 'encoder', 'tokenizer', 'flow', 'grant', 'arn', 'ref', 'store', 'storage',
  'helper', 'command', 'cmd', 'limit', 'count', 'length', 'size',
]);
const PASSWORD_WORDS = new Set(['password', 'passwd', 'pwd', 'passphrase']);
const KEY_NOT_SECRET_AFTER = new Set(['public', 'primary', 'partition', 'sort', 'foreign', 'cache', 'idempotency', 'dedupe', 'group']);

function nameWords(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** True when a key, header or flag name says it holds a credential. */
export function isSecretName(name) {
  const words = nameWords(name);
  if (words.length === 0) { return false; }
  const last = words[words.length - 1];
  if (NOT_THE_SECRET.has(last)) { return false; }
  for (let k = 0; k < words.length; k++) {
    if (SECRET_WORDS.has(words[k])) { return true; }
    if (k + 1 < words.length && SECRET_PAIRS.has(`${words[k]} ${words[k + 1]}`)) { return true; }
  }
  return last === 'key' && (words.length === 1 || !KEY_NOT_SECRET_AFTER.has(words[words.length - 2]));
}

function namesAPassword(name) {
  return nameWords(name).some((w) => PASSWORD_WORDS.has(w));
}

function looksLikeIdentifier(value) {
  return /^[a-z][a-z0-9]*(?:[-_.][a-z][a-z0-9]*)+$/.test(value.trim());
}

function isLiteralCandidate(value) {
  const t = value.trim();
  if (t.length < 8 || t.length > MAX_SHAPE_LENGTH || /\s/.test(t)) { return false; }
  if (isReference(t) || isPlaceholder(t) || containsReference(t)) { return false; }
  if (/^(?:true|false|yes|no|on|off)$/i.test(t)) { return false; }
  if (/^[0-9]+$/.test(t)) { return false; }
  if (/^(?:\/|\.{1,2}\/|~\/|[A-Za-z]:[\\/])/.test(t)) { return false; }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) { return false; }
  return true;
}

function safeDecode(part) {
  try { return decodeURIComponent(part); } catch { return part; }
}

function entropy(s) {
  const counts = new Map();
  for (const c of s) { counts.set(c, (counts.get(c) ?? 0) + 1); }
  let h = 0;
  for (const n of counts.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/** A URL path segment that is a key the way hosted MCP services issue one. */
export function isKeyLikeSegment(segment) {
  const s = safeDecode(segment);
  if (s.length < 24 || !/^[A-Za-z0-9_+=-]+$/.test(s)) { return false; }
  if (!/[A-Z]/.test(s) || !/[a-z]/.test(s) || !/[0-9]/.test(s)) { return false; }
  return entropy(s) >= 4.0 && !isPlaceholder(s);
}

const USERINFO = /^[a-z][a-z0-9+.-]*:\/\/([^:/?#@\s]*):([^@/?#\s]+)@/i;

function urlSecretKind(value, opts = { pathKeys: false }) {
  const t = value.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) { return null; }
  let url;
  try {
    url = new URL(t);
  } catch {
    const m = USERINFO.exec(t);
    const password = m ? safeDecode(m[2]) : '';
    return password && !isReference(password) && !isPlaceholder(password) ? 'password in a URL' : null;
  }
  const password = safeDecode(url.password);
  if (password && !isReference(password) && !isPlaceholder(password)) { return 'password in a URL'; }
  const user = safeDecode(url.username);
  if (user) {
    const shape = valueShapeKind(user);
    if (shape) { return shape; }
  }
  for (const [name, param] of url.searchParams) {
    if (!param || param.length > MAX_SHAPE_LENGTH) { continue; }
    if (isReference(param) || isPlaceholder(param) || containsReference(param)) { continue; }
    const shape = valueShapeKind(param);
    if (shape) { return shape; }
    if (isSecretName(name) && param.length >= 8) { return 'token in a URL'; }
  }
  for (const segment of url.pathname.split('/')) {
    if (!segment) { continue; }
    const shape = valueShapeKind(safeDecode(segment));
    if (shape) { return shape; }
    if (opts.pathKeys && isKeyLikeSegment(segment)) { return 'token in a URL'; }
  }
  return null;
}

function authSchemeKind(value) {
  const m = /^(bearer|token|basic|apikey|api-key)\s+(\S+)$/i.exec(value.trim());
  if (!m) { return null; }
  const credential = m[2];
  if (isReference(credential) || isPlaceholder(credential) || credential.length < 8) { return null; }
  const shape = valueShapeKind(credential);
  if (shape) { return shape; }
  const scheme = m[1].toLowerCase();
  if (scheme === 'basic') { return 'basic auth credentials'; }
  return scheme === 'bearer' || scheme === 'token' ? 'bearer token' : 'secret value';
}

export function classifyNamedValue(name, value) {
  if (isReference(value)) { return null; }
  return valueShapeKind(value)
    ?? urlSecretKind(value)
    ?? authSchemeKind(value)
    ?? (isSecretName(name) && isLiteralCandidate(value) && (namesAPassword(name) || !looksLikeIdentifier(value))
      ? 'secret value'
      : null);
}

function anywhereKind(value) {
  if (isReference(value)) { return null; }
  return valueShapeKind(value) ?? urlSecretKind(value);
}

const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s;

function classifyHeader(name, value) {
  if (isReference(value)) { return null; }
  const lower = name.toLowerCase();
  if (lower === 'authorization' || lower === 'proxy-authorization') {
    return authSchemeKind(value)
      ?? valueShapeKind(value)
      ?? (isLiteralCandidate(value) ? 'secret value' : null);
  }
  return classifyNamedValue(name, value);
}

/** The keys an MCP server map may live under (Claude Code, Cursor, VS Code, Codex). */
export const MCP_SERVER_KEYS = ['mcpServers', 'servers', 'mcp_servers'];

/**
 * Every MCP server map this plugin reads in one config: the top-level maps, and
 * for `~/.claude.json` ONLY the current project's `projects[<path>].mcpServers`
 * (Claude Code's local scope). Other projects' entries are never visited.
 */
export function serverMaps(root, projectKey) {
  const out = [];
  for (const key of MCP_SERVER_KEYS) {
    const servers = memberOfObj(root, key);
    if (servers?.kind === 'object') { out.push({ servers, projectEntry: false }); }
  }
  if (projectKey) {
    const projects = memberOfObj(root, 'projects');
    if (projects?.kind === 'object') {
      for (let k = projects.members.length - 1; k >= 0; k--) {
        const project = projects.members[k];
        if (project.key !== projectKey) { continue; }
        const servers = memberOfObj(project.value, 'mcpServers');
        if (servers?.kind === 'object') { out.push({ servers, projectEntry: true }); }
        break;
      }
    }
  }
  return out;
}

function memberOfObj(node, key) {
  if (!node || node.kind !== 'object') { return undefined; }
  for (let k = node.members.length - 1; k >= 0; k--) {
    if (node.members[k].key === key) { return node.members[k].value; }
  }
  return undefined;
}

const URL_FIELDS = ['url', 'httpUrl', 'serverUrl'];

function labelFor(key) {
  // A name is shown only when it is a plain identifier (an env var, a header, a server name)
  // AND the credential minimiser leaves it unchanged: a token-shaped identifier is unnamed (Codex X-692).
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(key) && safeText(key) === key ? key : '';
}

/**
 * Credentials in one parsed agent config.
 *   where: { location, scope, sweep, projectKey }
 *   sweep: also check every other string in the file for known token formats
 *          (off for `~/.claude.json`, which is the tool's own state).
 * Returns findings with `offset`; the caller turns offsets into lines.
 */
export function findConfigSecrets(root, where) {
  const findings = [];
  const add = (server, projectEntry, field, key, kind, offset) => {
    findings.push({
      rule: 'config-secret',
      severity: 'critical',
      location: where.location,
      scope: where.scope,
      server: labelFor(server),
      projectEntry,
      field,
      key: labelFor(key),
      kind,
      offset,
    });
  };
  const walked = new Set();

  const rootEnv = memberOfObj(root, 'env');
  if (rootEnv?.kind === 'object') {
    walked.add(rootEnv);
    for (const m of rootEnv.members) {
      if (m.value.kind !== 'string') { continue; }
      const kind = classifyNamedValue(m.key, m.value.value);
      if (kind) { add('', false, 'env', m.key, kind, m.keyOffset); }
    }
  }

  for (const { servers, projectEntry } of serverMaps(root, where.projectKey)) {
    for (const entry of servers.members) {
      const server = entry.key;
      const def = entry.value;
      if (def.kind !== 'object') { continue; }
      walked.add(def);

      for (const [member, field] of [['env', 'env'], ['headers', 'headers'], ['http_headers', 'headers']]) {
        const block = memberOfObj(def, member);
        if (block?.kind !== 'object') { continue; }
        for (const m of block.members) {
          if (m.value.kind !== 'string') { continue; }
          const kind = field === 'env' ? classifyNamedValue(m.key, m.value.value) : classifyHeader(m.key, m.value.value);
          if (kind) { add(server, projectEntry, field, m.key, kind, m.keyOffset); }
        }
      }
      const bearer = def.members.find((m) => m.key === 'bearer_token');
      if (bearer && bearer.value.kind === 'string') {
        const kind = classifyNamedValue('bearer_token', bearer.value.value);
        if (kind) { add(server, projectEntry, 'headers', 'bearer_token', kind, bearer.keyOffset); }
      }

      for (const m of def.members) {
        if (!URL_FIELDS.includes(m.key) || m.value.kind !== 'string') { continue; }
        const kind = urlSecretKind(m.value.value, { pathKeys: true });
        if (kind) { add(server, projectEntry, 'url', m.key, kind, m.keyOffset); }
      }

      const args = memberOfObj(def, 'args');
      if (args?.kind === 'array') {
        const items = args.items;
        for (let k = 0; k < items.length; k++) {
          const item = items[k];
          if (item.kind !== 'string') { continue; }
          const s = item.value;
          const at = item.offset;
          const header = /^([A-Za-z][A-Za-z0-9-]*)\s*:\s*(.+)$/.exec(s);
          if (header && !/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
            const kind = classifyHeader(header[1], header[2]);
            if (kind) { add(server, projectEntry, 'args', header[1], kind, at); }
            continue;
          }
          const withValue = /^(--?[A-Za-z][A-Za-z0-9_-]*)=(.*)$/s.exec(s);
          if (withValue) {
            const inner = ASSIGNMENT.exec(withValue[2]);
            const [name, value] = inner ? [inner[1], inner[2]] : [withValue[1], withValue[2]];
            const kind = classifyNamedValue(name, value);
            if (kind) { add(server, projectEntry, 'args', name, kind, at); }
            continue;
          }
          const assignment = ASSIGNMENT.exec(s);
          if (assignment) {
            const kind = classifyNamedValue(assignment[1], assignment[2]);
            if (kind) { add(server, projectEntry, 'args', assignment[1], kind, at); }
            continue;
          }
          const flag = /^--?[A-Za-z][A-Za-z0-9_-]*$/.exec(s);
          const next = items[k + 1];
          if (flag && isSecretName(s) && next?.kind === 'string' && !next.value.startsWith('-')) {
            const kind = classifyNamedValue(s, next.value);
            if (kind) {
              add(server, projectEntry, 'args', s, kind, at);
              k++;
            }
            continue;
          }
          const kind = valueShapeKind(s) ?? urlSecretKind(s, { pathKeys: true });
          if (kind) { add(server, projectEntry, 'args', `args[${k}]`, kind, at); }
        }
      }
    }
  }

  if (where.sweep) {
    const sweep = (node, key, offset) => {
      if (walked.has(node)) { return; }
      if (node.kind === 'object') {
        for (const m of node.members) { sweep(m.value, labelFor(m.key), m.keyOffset); }
      } else if (node.kind === 'array') {
        node.items.forEach((item, i) => sweep(item, key ? `${key}[${i}]` : '', item.offset));
      } else if (node.kind === 'string') {
        const kind = anywhereKind(node.value);
        if (kind) { add('', false, 'setting', key, kind, offset); }
      }
    };
    sweep(root, '', root.offset);
  }
  return findings;
}

/** A URL with every part that can carry a credential removed: userinfo, query, fragment, key-like path segments. */
function minimiseUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { return `${raw.slice(0, raw.indexOf('://') + 3)}…`; }
  const segments = url.pathname.split('/').map((seg) => (seg && (isKeyLikeSegment(seg) || valueShapeKind(safeDecode(seg))) ? '…' : seg));
  const path = url.pathname === '/' && !/^[^?#]*:\/\/[^/?#]*\/(?:[?#]|$)/.test(raw) ? '' : segments.join('/');
  const rest = url.search || url.hash ? '?…' : '';
  return `${url.protocol}//${url.host}${path}${rest}`;
}

/** Above this length safeText shows nothing of the text (bounds the worst case). */
const SAFE_TEXT_MAX = 2048;
const ANY_URL = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'`<>()]+/gi;
const SECRET_ASSIGNMENT = /(^|[\s"'(,;])(-{0,2}[A-Za-z_][A-Za-z0-9_.-]*)([=:])([^\s"'),;]+)/g;
const AUTH_SCHEME = /\b(bearer|token|basic|apikey|api-key)\s+[^\s"'),;]{8,}/gi;
const TOKEN_RUN = /[A-Za-z0-9_+/=.-]{16,}/g;
/** `user:password@` without a scheme (a pip or git spec); an image digest (`@sha256:`) is not userinfo. */
const BARE_USERINFO = /(^|[\s/(@=])([^\s/@:()"'=]+):([^\s/@()"']+)@(?!sha256:)/g;
/** Flags whose value is a credential by convention: `curl -u user:pass`, `--user`, mysql's attached `-pPASS`. */
const CREDENTIAL_FLAG = /(^|[\s(])(-u|--user|--password|--pass|--token|--api-key|--secret)(\s+|=)([^\s"'),;]+)/g;
const ATTACHED_P = /(^|[\s(])-p([^\s"'),;-][^\s"'),;]*)/g;
/** A name that reads as a credential even as one word (PGPASSWORD, MYSQL_PWD, X_AUTH). */
const CREDENTIAL_WORD = /pass(?:word|wd)?|secret|token|api[-_]?key|auth|cred|pwd/i;

/**
 * Text taken from a config file (a package spec, an allow rule, a name) with
 * every credential-shaped part replaced by "…", so a finding can carry it into
 * a report that reaches the model. Applied to every finding field before it is
 * stored, never only when rendering.
 */
export function safeText(text) {
  if (typeof text !== 'string') { return text; }
  // Longer than any spec or rule worth showing, and the patterns below are
  // quadratic on long unbroken runs (40 KB took 467 ms): fail closed.
  if (text.length > SAFE_TEXT_MAX) { return '…'; }
  if (PRIVATE_KEY.test(text)) { return '…'; }
  let t = text.replace(ANY_URL, (u) => minimiseUrl(u.replace(/[.,;:]+$/, '')));
  t = t.replace(AUTH_SCHEME, (_m, scheme) => `${scheme} …`);
  t = t.replace(BARE_USERINFO, (_m, lead) => `${lead}…@`);
  t = t.replace(CREDENTIAL_FLAG, (m, lead, flag, sep, value) => (isReference(value) ? m : `${lead}${flag}${sep}…`));
  t = t.replace(ATTACHED_P, (m, lead, value) => (/^[\d.:]+(?:\/(?:tcp|udp))?$/.test(value) || isReference(value) ? m : `${lead}-p…`));
  t = t.replace(SECRET_ASSIGNMENT, (m, lead, name, sep, value) => {
    const bare = name.replace(/^-+/, '');
    const secretName = isSecretName(bare) || CREDENTIAL_WORD.test(bare);
    return secretName && !isReference(value) && !isPlaceholder(value) ? `${lead}${name}${sep}…` : m;
  });
  t = t.replace(TOKEN_RUN, (run) => (valueShapeKind(run) || isKeyLikeSegment(run) ? '…' : run));
  return t;
}

/** Characters a token in prose is made of (trailing dots are trimmed). */
const PROSE_TOKEN = /[A-Za-z0-9_.-]{16,}/g;
const PROSE_URL = /\b[a-z][a-z0-9+.-]*:\/\/[^\s<>()"'`]+/gi;

/**
 * Known token formats, private keys and passwords inside URLs in a prose file
 * (CLAUDE.md, AGENTS.md). One finding per line; the value never leaves here.
 */
export function findInstructionSecrets(text, where) {
  const findings = [];
  const lines = text.split('\n');
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    if (line.length > 20000) { continue; }
    let kind = PRIVATE_KEY.test(line) ? 'private key' : null;
    if (!kind) {
      for (const m of line.matchAll(PROSE_TOKEN)) {
        const candidate = m[0].replace(/^\.+|\.+$/g, '');
        kind = valueShapeKind(candidate);
        if (kind) { break; }
      }
    }
    if (!kind) {
      for (const m of line.matchAll(PROSE_URL)) {
        kind = urlSecretKind(m[0].replace(/[.,;:]+$/, ''));
        if (kind) { break; }
      }
    }
    if (kind) {
      findings.push({ rule: 'instructions-secret', severity: 'critical', location: where.location, scope: where.scope, kind, line: n + 1 });
    }
  }
  return findings;
}
