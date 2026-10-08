import type { RepoGraph } from "./graph-types";

const KEY = (o: string, r: string, b?: string) => `rim:graph:${o}/${r}@${b ?? ""}`.toLowerCase();
const RECENT = "rim:recent";

export function readCached(o: string, r: string, b?: string): RepoGraph | null {
  try {
    const s = localStorage.getItem(KEY(o, r, b));
    return s ? (JSON.parse(s) as RepoGraph) : null;
  } catch {
    return null;
  }
}

export function writeCached(g: RepoGraph, b?: string) {
  try {
    localStorage.setItem(KEY(g.owner, g.repo, b), JSON.stringify(g));
  } catch {
    /* storage full: ignore */
  }
  const list = readRecent().filter((x) => !(x.owner === g.owner && x.repo === g.repo));
  list.unshift({ owner: g.owner, repo: g.repo, ...(b ? { branch: b } : {}), files: g.files.length, at: Date.now() });
  try {
    localStorage.setItem(RECENT, JSON.stringify(list.slice(0, 8)));
  } catch {
    /* ignore */
  }
}

export type Recent = { owner: string; repo: string; branch?: string; files: number; at: number };
export function readRecent(): Recent[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT) || "[]");
  } catch {
    return [];
  }
}

export function parseRepoUrl(input: string): { owner: string; repo: string; branch?: string } | null {
  const s = input.trim().replace(/\.git$/, "");
  const m =
    s.match(/github\.com[/:]([\w.-]+)\/([\w.-]+)(?:\/tree\/([^?#]+))?/i) ?? s.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!m) return null;
  return { owner: m[1]!, repo: m[2]!, ...(m[3] ? { branch: m[3] } : {}) };
}
