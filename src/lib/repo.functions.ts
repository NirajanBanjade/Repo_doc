import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  owner: z.string().regex(/^[\w.-]+$/),
  repo: z.string().regex(/^[\w.-]+$/),
  branch: z.string().max(200).optional(),
});

export const analyzeRepoFn = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }) => {
    const { analyzeRepo, RepoError } = await import("./analyze.server");
    try {
      return { ok: true as const, graph: await analyzeRepo(data.owner, data.repo, data.branch) };
    } catch (e) {
      if (e instanceof RepoError) return { ok: false as const, error: e.message };
      console.error(e);
      return { ok: false as const, error: "Something went wrong while analyzing this repository." };
    }
  });
