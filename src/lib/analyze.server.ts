import type { RepoFile, RepoGraph } from "./graph-types";

const MAX_FILES = 2000;
const MAX_TAR_BYTES = 80 * 1024 * 1024;
const JS_EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".vue", ".svelte"];
const SKIP_DIRS = /(^|\/)(node_modules|\.git|dist|build|out|\.next|vendor|__pycache__|\.venv|venv|coverage)\//;
const SKIP_FILES = /\.(png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot|mp4|mp3|pdf|zip|gz|lock|map|min\.js)$/i;

export class RepoError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function gh(url: string) {
  const headers: Record<string, string> = {
    "User-Agent": "repo-impact-map",
    Accept: "application/vnd.github+json",
  };
  const token = process.env['GITHUB_TOKEN'];
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { headers });
}

async function resolveRef(owner: string, repo: string, branch?: string) {
  if (branch) return branch;
  const r = await gh(`https://api.github.com/repos/${owner}/${repo}`);
  if (r.status === 404) throw new RepoError("Repository not found or it's private.", 404);
  if (r.status === 403 || r.status === 429)
    throw new RepoError("GitHub rate limit reached. Please try again in a few minutes.", 429);
  if (!r.ok) throw new RepoError(`GitHub error (${r.status}).`, 502);
  const j = (await r.json()) as { default_branch: string };
  return j.default_branch;
}

function readStr(b: Uint8Array, off: number, len: number) {
  let end = off;
  while (end < off + len && b[end] !== 0) end++;
  return new TextDecoder().decode(b.subarray(off, end));
}

async function untar(owner: string, repo: string, ref: string) {
  const r = await fetch(`https://codeload.github.com/${owner}/${repo}/tar.gz/${encodeURIComponent(ref)}`);
  if (r.status === 404) throw new RepoError("Branch not found.", 404);
  if (!r.ok || !r.body) throw new RepoError(`Could not download repository (${r.status}).`, 502);
  const stream = r.body.pipeThrough(new DecompressionStream("gzip"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    if (total > MAX_TAR_BYTES) {
      await reader.cancel();
      throw new RepoError("Repository is too large to analyze (over 80 MB).", 413);
    }
  }
  const buf = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    buf.set(c, o);
    o += c.length;
  }

  const files: { path: string; content: string; size: number }[] = [];
  let pos = 0;
  let longName: string | null = null;
  const dec = new TextDecoder();
  while (pos + 512 <= buf.length) {
    const h = buf.subarray(pos, pos + 512);
    if (h.every((x) => x === 0)) break;
    let name = readStr(h, 0, 100);
    const prefix = readStr(h, 345, 155);
    if (prefix) name = prefix + "/" + name;
    const size = parseInt(readStr(h, 124, 12).trim() || "0", 8);
    const type = String.fromCharCode(h[156] || 48);
    const dataStart = pos + 512;
    const data = buf.subarray(dataStart, dataStart + size);
    pos = dataStart + Math.ceil(size / 512) * 512;
    if (type === "x") {
      const m = dec.decode(data).match(/\d+ path=([^\n]+)\n/);
      longName = m?.[1] ?? null;
      continue;
    }
    if (type === "L") {
      longName = readStr(data, 0, data.length);
      continue;
    }
    if (type === "g") continue;
    if (longName) {
      name = longName;
      longName = null;
    }
    if (type !== "0" && type !== "\0") continue;
    const rel = name.split("/").slice(1).join("/");
    if (!rel || SKIP_DIRS.test(rel) || SKIP_FILES.test(rel)) continue;
    const isSource = isSrc(rel) || rel.endsWith("tsconfig.json") || rel.endsWith("jsconfig.json");
    files.push({ path: rel, size, content: isSource && size < 400_000 ? dec.decode(data) : "" });
  }
  return files;
}

function isSrc(p: string) {
  return JS_EXT.some((e) => p.endsWith(e)) || p.endsWith(".py");
}

function stripJsonComments(s: string) {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"])\/\/.*$/gm, "$1").replace(/,(\s*[}\]])/g, "$1");
}

function normalize(p: string) {
  const out: string[] = [];
  for (const seg of p.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}

export async function analyzeRepo(owner: string, repo: string, branch?: string): Promise<RepoGraph> {
  const ref = await resolveRef(owner, repo, branch);
  const raw = await untar(owner, repo, ref);

  // Prefer source files when capping.
  raw.sort((a, b) => Number(isSrc(b.path)) - Number(isSrc(a.path)));
  const truncated = raw.length > MAX_FILES;
  const kept = raw.slice(0, MAX_FILES).sort((a, b) => a.path.localeCompare(b.path));

  const files: RepoFile[] = kept.map((f) => ({
    path: f.path,
    size: f.size,
    lang: f.path.endsWith(".py") ? "py" : isSrc(f.path) ? "js" : "other",
  }));
  const byPath = new Map(files.map((f, i) => [f.path, i]));

  // Alias map from tsconfig/jsconfig paths
  const aliases: { from: string; to: string[] }[] = [];
  for (const f of kept) {
    if (!/(^|\/)(tsconfig|jsconfig)\.json$/.test(f.path) || !f.content) continue;
    try {
      const j = JSON.parse(stripJsonComments(f.content));
      const base = normalize(dirOf(f.path) + "/" + (j.compilerOptions?.baseUrl ?? "."));
      for (const [k, v] of Object.entries<string[]>(j.compilerOptions?.paths ?? {}))
        aliases.push({
          from: k.replace(/\*$/, ""),
          to: v.map((t) => normalize(base + "/" + t.replace(/\*$/, "")) + (t.endsWith("/*") ? "/" : "")),
        });
    } catch {
      /* ignore */
    }
  }
  if (!aliases.some((a) => a.from === "@/")) aliases.push({ from: "@/", to: ["src/", ""] });
  if (!aliases.some((a) => a.from === "~/")) aliases.push({ from: "~/", to: ["src/", "app/", ""] });

  const tryJs = (base: string): number | undefined => {
    base = normalize(base);
    if (byPath.has(base)) return byPath.get(base);
    for (const e of JS_EXT) if (byPath.has(base + e)) return byPath.get(base + e);
    const noJs = base.replace(/\.(m|c)?js$/, "");
    if (noJs !== base) for (const e of JS_EXT) if (byPath.has(noJs + e)) return byPath.get(noJs + e);
    for (const e of JS_EXT) if (byPath.has(base + "/index" + e)) return byPath.get(base + "/index" + e);
    return undefined;
  };

  const edges = new Set<string>();
  const jsRe =
    /(?:import\s+(?:[\w*{}\s,$]+?\s+from\s+)?|export\s+[\w*{}\s,$]+?\s+from\s+|import\s*\(\s*|require\s*\(\s*)["'`]([^"'`]+)["'`]/g;

  kept.forEach((f, i) => {
    if (!f.content) return;
    const dir = dirOf(f.path);
    if (files[i]!.lang === "js") {
      for (const m of f.content.matchAll(jsRe)) {
        const spec = m[1]!;
        let target: number | undefined;
        if (spec.startsWith(".")) target = tryJs(dir + "/" + spec);
        else if (spec.startsWith("/")) target = tryJs(spec);
        else
          for (const a of aliases) {
            if (!spec.startsWith(a.from) && spec !== a.from.replace(/\/$/, "")) continue;
            for (const t of a.to) {
              target = tryJs(t + spec.slice(a.from.length));
              if (target !== undefined) break;
            }
            if (target !== undefined) break;
          }
        if (target !== undefined && target !== i) edges.add(i + ":" + target);
      }
    } else if (files[i]!.lang === "py") {
      const tryPy = (mod: string, baseDir: string) => {
        const p = normalize(baseDir + "/" + mod.replace(/\./g, "/"));
        return byPath.get(p + ".py") ?? byPath.get(p + "/__init__.py");
      };
      const roots = ["", "src", dir];
      const add = (t: number | undefined) => t !== undefined && t !== i && edges.add(i + ":" + t);
      for (const m of f.content.matchAll(/^\s*from\s+(\.*)([\w.]*)\s+import\s+([\w*,\s()]+)/gm)) {
        const dots = m[1]!.length;
        const mod = m[2]!;
        const names = m[3]!.replace(/[()]/g, "").split(",").map((s) => s.trim().split(/\s+/)[0] ?? "").filter(Boolean);
        if (dots) {
          let base = dir;
          for (let k = 1; k < dots; k++) base = dirOf(base);
          const t = mod ? tryPy(mod, base) : undefined;
          add(t);
          for (const n of names) add(tryPy(mod ? mod + "." + n : n, base));
        } else {
          for (const r of roots) {
            const t = tryPy(mod, r);
            if (t !== undefined) {
              add(t);
              for (const n of names) add(tryPy(mod + "." + n, r));
              break;
            }
          }
        }
      }
      for (const m of f.content.matchAll(/^\s*import\s+([\w., ]+)/gm))
        for (const mod of m[1]!.split(",").map((s) => s.trim().split(/\s+/)[0]!))
          for (const r of roots) {
            const t = tryPy(mod, r);
            if (t !== undefined) {
              add(t);
              break;
            }
          }
    }
  });

  return {
    owner,
    repo,
    ref,
    files,
    edges: [...edges].map((e) => e.split(":").map(Number) as [number, number]),
    truncated,
    analyzedAt: Date.now(),
  };
}

function dirOf(p: string) {
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i);
}
