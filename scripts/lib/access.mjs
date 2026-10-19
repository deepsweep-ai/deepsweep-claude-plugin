/**
 * What Claude Code's settings let it do without asking, how far it reaches,
 * and whether its MCP servers run code that can change under it.
 *
 * PROVENANCE: ported from the DeepSweep editor extension's agent-access
 * rules, types removed. Only the Claude Code settings
 * rules and the MCP server rules are ported; the Codex and VS Code settings
 * rules stay in the extension. Rule ids and severities are unchanged so a
 * finding means the same thing in both places.
 *
 * WHAT IS NOT A FINDING: a rule that `deny` or `ask` overrides; a package or
 * image pinned to an exact version or digest; a remote server whose entry sets
 * any sign-in; a server on localhost.
 */
import { memberNamed, memberOf, stringItems } from './jsontree.mjs';
import { isKeyLikeSegment, isSecretName, safeText, serverMaps } from './secrets.mjs';

/** Commands that act outside the workspace (push, publish, deploy, destroy). */
export const SENSITIVE_COMMANDS = [
  { label: 'git push', samples: ['git push', 'git push origin main', 'git push --force origin main'] },
  { label: 'git reset --hard', samples: ['git reset --hard', 'git reset --hard HEAD~1'] },
  { label: 'rm -rf', samples: ['rm -rf build', 'rm -rf /tmp/cache'] },
  { label: 'sudo', samples: ['sudo rm -rf /var/cache'] },
  { label: 'npm publish', samples: ['npm publish', 'npm publish --access public'] },
  { label: 'pnpm publish', samples: ['pnpm publish', 'pnpm publish --access public'] },
  { label: 'yarn publish', samples: ['yarn publish', 'yarn npm publish'] },
  { label: 'cargo publish', samples: ['cargo publish'] },
  { label: 'twine upload', samples: ['twine upload dist/*'] },
  { label: 'gem push', samples: ['gem push app-1.0.0.gem'] },
  { label: 'docker push', samples: ['docker push ghcr.io/org/app:1.0'] },
  { label: 'gh release create', samples: ['gh release create v1.0.0'] },
  { label: 'gh pr merge', samples: ['gh pr merge 12 --squash'] },
  { label: 'terraform apply', samples: ['terraform apply', 'terraform apply -auto-approve'] },
  { label: 'terraform destroy', samples: ['terraform destroy', 'terraform destroy -auto-approve'] },
  { label: 'pulumi up', samples: ['pulumi up --yes'] },
  { label: 'kubectl apply', samples: ['kubectl apply -f deploy.yaml'] },
  { label: 'kubectl delete', samples: ['kubectl delete pod web-1'] },
  { label: 'helm upgrade', samples: ['helm upgrade --install web ./chart'] },
  { label: 'cdk deploy', samples: ['cdk deploy', 'npx cdk deploy'] },
  { label: 'sam deploy', samples: ['sam deploy'] },
  { label: 'serverless deploy', samples: ['serverless deploy', 'sls deploy'] },
  { label: 'vercel deploy', samples: ['vercel --prod', 'vercel deploy --prod'] },
  { label: 'netlify deploy', samples: ['netlify deploy --prod'] },
  { label: 'firebase deploy', samples: ['firebase deploy'] },
  { label: 'fly deploy', samples: ['fly deploy', 'flyctl deploy'] },
  { label: 'wrangler deploy', samples: ['wrangler deploy', 'npx wrangler deploy'] },
  { label: 'gcloud deploy', samples: ['gcloud run deploy web', 'gcloud app deploy'] },
  { label: 'database migration', samples: ['prisma migrate deploy', 'npx prisma migrate deploy', 'npx prisma db push', 'drizzle-kit push'] },
];

/** The part inside `Bash(...)`, or `'*'` for the bare tool, or null for a rule about another tool. */
export function bashRuleSpecifier(rule) {
  const t = rule.trim();
  if (t === 'Bash') { return '*'; }
  const m = /^Bash\((.*)\)$/s.exec(t);
  return m ? m[1].trim() : null;
}

/** True when a `Bash(...)` specifier allows every command. */
export function isAnyCommand(spec) {
  return spec === '' || /^[*:\s]+$/.test(spec);
}

/** Whether a `Bash(...)` specifier matches one command line (prefix `x:*` and wildcard forms). */
export function bashRuleMatches(spec, command) {
  if (isAnyCommand(spec)) { return true; }
  if (spec.endsWith(':*')) {
    const prefix = spec.slice(0, -2).trim();
    return command === prefix || command.startsWith(`${prefix} `);
  }
  if (spec.includes('*')) {
    const collapsed = spec.replace(/\*+/g, '*');
    if ((collapsed.match(/\*/g) ?? []).length > 8) { return false; }
    const pattern = collapsed.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return new RegExp(`^${pattern}$`, 's').test(command) || new RegExp(`^${pattern.replace(/ \.\*$/, '')}$`, 's').test(command);
  }
  return spec === command;
}

/** What a directory entry covers when it is too broad to be one project, in words this module chose. */
export function broadDirectory(dir, userRoot) {
  const raw = dir.trim();
  if (raw === '') { return null; }
  const t = raw.length > 1 ? raw.replace(/[\\/]+$/, '') : raw;
  if (t === '/' || t === '' || /^[A-Za-z]:$/.test(t) || t === '\\') { return 'the whole filesystem'; }
  if (/^(?:~|\$HOME|\$\{HOME\}|\$\{env:HOME\}|\$\{userHome\}|%USERPROFILE%|%HOMEPATH%|\$\{env:USERPROFILE\})$/i.test(t)) { return 'your home folder'; }
  const norm = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '');
  if (userRoot) {
    const a = norm(t);
    const b = norm(userRoot);
    const caseless = /^[A-Za-z]:/.test(a) || /^[A-Za-z]:/.test(b);
    if (caseless ? a.toLowerCase() === b.toLowerCase() : a === b) { return 'your home folder'; }
  }
  if (/^(?:\/Users|\/home|[A-Za-z]:[\\/]Users)$/i.test(t)) { return "every user's home folder"; }
  return null;
}

/** A hook command that answers "allow" to the permission question, written inline. */
const AUTO_ALLOW = /permissionDecision\W{1,8}allow\b|"decision"\s*:\s*\\?"approve\\?"/;

/** Every text field from the config is minimised here, before any finding holds it. */
function emit(out, ctx, offset, rule, severity, subject, detail) {
  const f = { rule, severity, location: ctx.location, scope: ctx.scope, subject: safeText(subject), offset };
  if (detail !== undefined) { f.detail = safeText(detail); }
  if (ctx.projectEntry) { f.projectEntry = true; }
  out.push(f);
  return f;
}

/** Findings in one Claude Code settings file (`settings.json` / `settings.local.json`). */
export function claudeSettingsFindings(root, ctx) {
  const out = [];
  const perms = memberOf(root, 'permissions');

  const mode = memberNamed(perms, 'defaultMode');
  if (mode && mode.value.kind === 'string' && mode.value.value === 'bypassPermissions') {
    // A project or local default is ignored from Claude Code 2.1.257, so it is medium there, as in the extension.
    emit(out, ctx, mode.keyOffset, 'claude-bypass-permissions', ctx.scope === 'project' ? 'medium' : 'high', 'defaultMode');
  }

  const denyOrAsk = [...stringItems(memberOf(perms, 'deny')), ...stringItems(memberOf(perms, 'ask'))]
    .map((r) => bashRuleSpecifier(r.value))
    .filter((s) => s !== null);
  const overridden = (command) => denyOrAsk.some((s) => bashRuleMatches(s, command));

  for (const rule of stringItems(memberOf(perms, 'allow'))) {
    const spec = bashRuleSpecifier(rule.value);
    if (spec === null) { continue; }
    if (isAnyCommand(spec)) {
      if (denyOrAsk.some(isAnyCommand)) { continue; }
      // Approved component: the canonical any-command form, never the rule's own text.
      emit(out, ctx, rule.offset, 'claude-any-shell', 'high', 'any shell command', spec.trim() === '*' ? 'Bash(*)' : 'Bash');
      continue;
    }
    const granted = SENSITIVE_COMMANDS
      .filter((c) => c.samples.some((sample) => bashRuleMatches(spec, sample) && !overridden(sample)))
      .map((c) => c.label);
    if (granted.length > 0) {
      // The subject is built from the closed SENSITIVE_COMMANDS labels; the rule's own text is never kept.
      emit(out, ctx, rule.offset, 'claude-sensitive-command', 'high',
        granted.slice(0, 3).join(', ') + (granted.length > 3 ? ` and ${granted.length - 3} more` : ''));
    }
  }

  for (const d of stringItems(memberOf(perms, 'additionalDirectories'))) {
    const covers = broadDirectory(d.value, ctx.userRoot);
    if (covers) { emit(out, ctx, d.offset, 'claude-broad-directory', 'high', covers); }
  }

  const all = memberNamed(root, 'enableAllProjectMcpServers');
  if (all && all.value.kind === 'boolean' && all.value.value) {
    emit(out, ctx, all.keyOffset, 'claude-all-project-servers', 'high', 'enableAllProjectMcpServers');
  }

  const pre = memberOf(memberOf(root, 'hooks'), 'PreToolUse');
  if (pre?.kind === 'array') {
    for (const group of pre.items) {
      if (group.kind !== 'object') { continue; }
      const matcher = memberOf(group, 'matcher');
      const matcherText = matcher?.kind === 'string' ? matcher.value.trim() : '';
      const commands = [];
      const inner = memberOf(group, 'hooks');
      if (inner?.kind === 'array') {
        for (const h of inner.items) { const c = memberOf(h, 'command'); if (c) { commands.push(c); } }
      } else {
        const c = memberOf(group, 'command');
        if (c) { commands.push(c); }
      }
      if (!commands.some((c) => c.kind === 'string' && AUTO_ALLOW.test(c.value))) { continue; }
      const every = matcherText === '' || matcherText === '*' || matcherText === '.*';
      const subject = every ? 'every tool' : /^[A-Za-z0-9_.*]{1,40}(?:\|[A-Za-z0-9_.*]{1,40}){0,5}$/.test(matcherText) ? matcherText : 'some tools';
      emit(out, ctx, group.offset, 'claude-auto-allow-hook', 'high', subject);
    }
  }
  return out;
}

// ---------------------------------------------------------------- MCP servers

/** A server name is shown only when it is a plain identifier; anything else is unnamed. */
const PLAIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function serverLabel(name) {
  return PLAIN_NAME.test(name) && safeText(name) === name ? name : '';
}

/** npm (`@scope/name@range`) and PyPI (`name[extra]==1.2`) specs, by grammar. Nothing else is shown as written. */
const NPM_SPEC = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*(?:@[A-Za-z0-9.^~<>=*|+-]{1,40})?$/;
const PY_SPEC = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\[[A-Za-z0-9,._-]+\])?(?:(?:==|>=|<=|~=|!=|<|>)[A-Za-z0-9.*+!-]{1,40})?$/;
/** An image reference: registry[:port]/path[:tag][@sha256:digest]. */
const IMAGE_REF = /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?::[0-9]{1,5})?(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})?(?:@sha256:[a-f0-9]{64})?$/;
const SOURCE_NAME = /^((?:@[a-z0-9][a-z0-9._~-]*\/)?[A-Za-z0-9][A-Za-z0-9._~-]*)\s*@\s*(?=[a-z][a-z0-9+.-]*:\/\/)/;

/**
 * What a finding may say about the package or image a server runs: the spec when
 * it parses as a plain package or image reference; for a URL source, only the
 * package name, scheme and host, parsed; otherwise a closed phrase. Config text
 * that fits none of these never reaches a finding (Codex X-691 R1).
 */
export function approvedSpec(what, spec) {
  const t = spec.trim();
  if (what === 'image') { return IMAGE_REF.test(t) ? t : 'an image from an unrecognised reference'; }
  if (NPM_SPEC.test(t) || PY_SPEC.test(t)) { return t; }
  const scheme = /[a-z][a-z0-9+.-]*:\/\//.exec(t);
  if (scheme) {
    const named = SOURCE_NAME.exec(t);
    let host = null;
    try {
      const u = new URL(t.slice(scheme.index));
      if (/^[a-z0-9.-]+(?::[0-9]{1,5})?$/i.test(u.host)) { host = `${u.protocol}//${u.host}`; }
    } catch { /* not a URL: no host is shown */ }
    const name = named && PLAIN_NAME.test(named[1].replace(/^@[^/]+\//, '')) ? named[1] : null;
    if (host) { return `${name ? `${name} from` : 'a package from'} ${host}`; }
    return name ? `${name} from a URL` : 'a package from a URL';
  }
  return 'a package from an unrecognised source';
}

function programOf(command) {
  const base = command.trim().split(/[\\/]/).pop() ?? '';
  return base.replace(/\.(?:exe|cmd|bat|ps1)$/i, '').toLowerCase();
}

function commandLine(def) {
  const cmd = memberOf(def, 'command');
  if (cmd?.kind !== 'string') { return []; }
  const args = stringItems(memberOf(def, 'args')).map((a) => a.value);
  let line = args.length === 0 && /\s/.test(cmd.value.trim()) ? cmd.value.trim().split(/\s+/) : [cmd.value, ...args];
  if (programOf(line[0] ?? '') === 'cmd' && /^\/[cCkK]$/.test(line[1] ?? '')) { line = line.slice(2); }
  return line;
}

const NPX_VALUE_FLAGS = new Set(['-p', '--package', '-c', '--call', '--registry', '--cache', '--userconfig', '-w', '--workspace', '--loglevel']);
const UVX_VALUE_FLAGS = new Set(['--from', '--with', '--with-editable', '--with-requirements', '--python', '-p', '--index', '--index-url',
  '--extra-index-url', '--default-index', '--find-links', '-f', '--constraints', '--overrides', '--env-file', '--directory', '--project',
  '--config-file', '--cache-dir', '--python-preference', '--refresh-package', '--reinstall-package', '--upgrade-package', '--prerelease',
  '--resolution', '--index-strategy', '--keyring-provider', '--exclude-newer', '--link-mode', '--compile-bytecode', '-C', '--config-setting']);
const DOCKER_VALUE_FLAGS = new Set(['-e', '--env', '--env-file', '-v', '--volume', '--mount', '-p', '--publish', '--name', '-w', '--workdir',
  '-u', '--user', '--network', '--net', '--entrypoint', '-l', '--label', '--label-file', '--platform', '--pull', '--add-host', '--cap-add',
  '--cap-drop', '--device', '--dns', '--dns-search', '--dns-option', '--hostname', '-h', '--ipc', '--memory', '-m', '--memory-swap', '--cpus',
  '--cpu-shares', '-c', '--cpuset-cpus', '--restart', '--runtime', '--security-opt', '--shm-size', '--tmpfs', '--ulimit', '--gpus',
  '--log-driver', '--log-opt', '--pid', '--userns', '--volumes-from', '--cidfile', '--health-cmd', '--group-add', '--expose', '--link',
  '--mac-address', '--ip', '--ip6', '--stop-signal', '--stop-timeout', '--storage-opt', '--sysctl', '--uts', '--isolation', '-a', '--attach']);

function firstOperand(args, valueFlags, specFlags) {
  let spec;
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === '--') { return { operand: args[k + 1], spec }; }
    if (a.startsWith('-')) {
      const eq = a.indexOf('=');
      const flag = eq > 0 ? a.slice(0, eq) : a;
      const value = eq > 0 ? a.slice(eq + 1) : undefined;
      if (specFlags.has(flag) && spec === undefined) { spec = value ?? args[k + 1]; }
      if (eq < 0 && valueFlags.has(flag)) { k++; }
      continue;
    }
    return { operand: a, spec };
  }
  return { spec };
}

const LOCAL_RUNNERS = new Set(['tsx', 'ts-node', 'node', 'nodemon', 'bun', 'deno', 'vite-node', 'esno', 'esrun', 'python', 'python3']);

export function npmSpecPinning(spec) {
  const s = spec.trim();
  if (!s || /^(?:\.{0,2}[\\/]|~[\\/]|[A-Za-z]:[\\/]|[a-z+]+:)/i.test(s) || s.includes('${')) { return 'unknown'; }
  const at = s.lastIndexOf('@');
  const name = at > 0 ? s.slice(0, at) : s;
  const version = at > 0 ? s.slice(at + 1) : '';
  if (!/^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i.test(name) || LOCAL_RUNNERS.has(name.toLowerCase())) { return 'unknown'; }
  if (!version) { return 'unpinned'; }
  return /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version) ? 'pinned' : 'unpinned';
}

export function pySpecPinning(spec) {
  const s = spec.trim();
  if (!s || /^(?:\.{0,2}[\\/]|~[\\/]|[A-Za-z]:[\\/]|[a-z+]+:)/i.test(s) || s.includes('${')) { return 'unknown'; }
  const eq = /^([A-Za-z0-9][A-Za-z0-9._-]*(?:\[[^\]]*\])?)\s*===?\s*([0-9][0-9A-Za-z.+!-]*)$/.exec(s);
  if (eq) { return 'pinned'; }
  const at = /^([A-Za-z0-9][A-Za-z0-9._-]*(?:\[[^\]]*\])?)@(.+)$/.exec(s);
  if (at) { return /^v?\d+(?:\.\d+)+(?:[0-9A-Za-z.+!-]*)$/.test(at[2]) ? 'pinned' : 'unpinned'; }
  if (/^[A-Za-z0-9][A-Za-z0-9._-]*(?:\[[^\]]*\])?$/.test(s)) { return LOCAL_RUNNERS.has(s.toLowerCase()) ? 'unknown' : 'unpinned'; }
  return /[<>~!=]/.test(s) ? 'unpinned' : 'unknown';
}

export function imagePinning(image) {
  const s = image.trim();
  if (!s || s.includes('${') || s.startsWith('$')) { return 'unknown'; }
  if (/@sha256:[0-9a-f]{64}$/i.test(s)) { return 'pinned'; }
  const last = s.slice(s.lastIndexOf('/') + 1);
  const colon = last.lastIndexOf(':');
  if (colon < 0) { return 'unpinned'; }
  const tag = last.slice(colon + 1);
  return tag === '' || tag.toLowerCase() === 'latest' ? 'unpinned' : 'pinned';
}

export function serverPinning(line) {
  if (line.length === 0) { return null; }
  const prog = programOf(line[0]);
  const rest = line.slice(1);
  const npm = (args) => {
    const { operand, spec } = firstOperand(args, NPX_VALUE_FLAGS, new Set(['-p', '--package']));
    const pkg = spec ?? operand;
    return pkg ? { what: 'package', spec: pkg, pinning: npmSpecPinning(pkg) } : null;
  };
  const py = (args) => {
    const { operand, spec } = firstOperand(args, UVX_VALUE_FLAGS, new Set(['--from', '--spec']));
    const pkg = spec ?? operand;
    return pkg ? { what: 'package', spec: pkg, pinning: pySpecPinning(pkg) } : null;
  };
  if (prog === 'npx' || prog === 'bunx' || prog === 'pnpx') { return npm(rest); }
  if ((prog === 'pnpm' || prog === 'yarn') && rest[0] === 'dlx') { return npm(rest.slice(1)); }
  if (prog === 'npm' && (rest[0] === 'exec' || rest[0] === 'x')) { return npm(rest.slice(1)); }
  if (prog === 'bun' && rest[0] === 'x') { return npm(rest.slice(1)); }
  if (prog === 'uvx') { return py(rest); }
  if (prog === 'uv' && rest[0] === 'tool' && rest[1] === 'run') { return py(rest.slice(2)); }
  if (prog === 'pipx' && rest[0] === 'run') { return py(rest.slice(1)); }
  if (prog === 'docker' || prog === 'podman') {
    const k = rest[0] === 'run' ? 1 : rest[0] === 'container' && rest[1] === 'run' ? 2 : -1;
    if (k < 0) { return null; }
    const { operand } = firstOperand(rest.slice(k), DOCKER_VALUE_FLAGS, new Set());
    return operand ? { what: 'image', spec: operand, pinning: imagePinning(operand) } : null;
  }
  return null;
}

const URL_FIELDS = ['url', 'httpUrl', 'serverUrl'];
const SIGN_IN_HEADER = /^(?:authorization|proxy-authorization|cookie|x-api-key|api-key|apikey|x-auth-token|x-access-token)$/i;

export function remoteServerHasSignIn(def, url) {
  for (const field of ['headers', 'http_headers']) {
    const h = memberOf(def, field);
    if (h?.kind === 'object' && h.members.some((m) => (SIGN_IN_HEADER.test(m.key) || isSecretName(m.key)) && m.value.kind === 'string' && m.value.value.trim() !== '')) {
      return true;
    }
  }
  const envHeaders = memberOf(def, 'env_http_headers');
  if (envHeaders?.kind === 'object' && envHeaders.members.length > 0) { return true; }
  for (const field of ['bearer_token_env_var', 'bearer_token', 'authProviderType']) {
    const v = memberOf(def, field);
    if (v?.kind === 'string' && v.value.trim() !== '') { return true; }
  }
  for (const field of ['oauth', 'auth']) {
    const v = memberOf(def, field);
    if (v && !(v.kind === 'boolean' && !v.value) && v.kind !== 'null' && !(v.kind === 'string' && /^(?:none|disabled|false)$/i.test(v.value))) {
      if (v.kind === 'object') {
        const enabled = memberOf(v, 'enabled');
        if (enabled?.kind === 'boolean' && !enabled.value) { continue; }
      }
      return true;
    }
  }
  try {
    const u = new URL(url);
    if (u.username || u.password) { return true; }
    for (const name of u.searchParams.keys()) {
      if (isSecretName(name) || /^(?:key|code|sig|signature|access_token|apikey)$/i.test(name)) { return true; }
    }
    if (u.pathname.split('/').some((seg) => seg && isKeyLikeSegment(seg))) { return true; }
  } catch {
    // An unparseable URL is judged on its fields above.
  }
  return false;
}

export function remoteHost(url) {
  let u;
  try { u = new URL(url.trim()); } catch { return null; }
  if (!/^(?:https?|wss?):$/.test(u.protocol)) { return null; }
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '0.0.0.0' || /^127\./.test(host)) { return null; }
  return host;
}

const FILESYSTEM_SERVER = /(?:^|[/@])(?:server-filesystem|mcp-server-filesystem|filesystem-mcp|mcp-filesystem)(?:@|$)/i;

/** Findings for every MCP server in one parsed config (`.mcp.json`, `~/.claude.json`, ...). */
export function mcpServerFindings(root, fileCtx) {
  const out = [];
  for (const { servers, projectEntry } of serverMaps(root, fileCtx.projectKey)) {
    const ctx = projectEntry ? { ...fileCtx, projectEntry: true } : fileCtx;
    for (const entry of servers.members) {
      const def = entry.value;
      if (def.kind !== 'object') { continue; }
      const name = serverLabel(entry.key);
      const serverAt = entry.keyOffset;

      const line = commandLine(def);
      const pin = serverPinning(line);
      const argsMember = memberNamed(def, 'args') ?? memberNamed(def, 'command');
      if (pin && pin.pinning === 'unpinned') {
        emit(out, ctx, argsMember ? argsMember.keyOffset : serverAt, pin.what === 'image' ? 'mcp-unpinned-image' : 'mcp-unpinned-package',
          'medium', name, approvedSpec(pin.what, pin.spec));
      }

      if (line.some((a) => FILESYSTEM_SERVER.test(a))) {
        const pkgIndex = line.findIndex((a) => FILESYSTEM_SERVER.test(a));
        for (const dir of line.slice(pkgIndex + 1)) {
          if (dir.startsWith('-')) { continue; }
          const covers = broadDirectory(dir, ctx.userRoot);
          if (covers) {
            emit(out, ctx, argsMember ? argsMember.keyOffset : serverAt, 'mcp-filesystem-broad', 'high', name, covers);
            break;
          }
        }
      }

      for (const m of def.members) {
        if (!URL_FIELDS.includes(m.key) || m.value.kind !== 'string') { continue; }
        const host = remoteHost(m.value.value);
        if (host && !remoteServerHasSignIn(def, m.value.value)) {
          emit(out, ctx, m.keyOffset, 'mcp-remote-no-sign-in', 'medium', name, host);
        }
        break;
      }
    }
  }
  return out;
}
