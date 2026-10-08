import { createOpenAI } from "@ai-sdk/openai";
import { streamText, APICallError } from "ai";
import { z } from "zod";

const Body = z.object({
  owner: z.string().regex(/^[\w.-]+$/),
  repo: z.string().regex(/^[\w.-]+$/),
  ref: z.string().max(200),
  target: z.object({ type: z.enum(["file", "folder"]), path: z.string().max(500) }),
  dependencies: z.array(z.string().max(500)).max(80),
  impacted: z.array(z.object({ path: z.string().max(500), hop: z.number() })).max(300),
  folderFiles: z.array(z.string().max(500)).max(300).optional(),
  mode: z.enum(["explain", "impact", "ask"]),
  question: z.string().max(2000).optional(),
});

async function raw(owner: string, repo: string, ref: string, path: string, limit: number) {
  try {
    const r = await fetch(
      `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/${path
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
    );
    if (!r.ok) return "";
    const t = await r.text();
    return t.length > limit ? t.slice(0, limit) + "\n/* ...truncated... */" : t;
  } catch {
    return "";
  }
}

function friendly(status?: number) {
  if (status === 402)
    return "AI credits ran out. Add credits in Settings → Plans & credits, then try again.";
  if (status === 429) return "The AI is busy right now. Please wait a moment and try again.";
  if (status === 403) return "AI access is blocked for this workspace.";
  return "The AI request failed. Please try again.";
}

export async function handleAi(request: Request) {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) return new Response("AI is not configured.", { status: 500 });
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return new Response("Invalid request.", { status: 400 });
  }
  const { owner, repo, ref, target } = body;

  let context = "";
  if (target.type === "file") {
    context += `## Selected file: ${target.path}\n\`\`\`\n${await raw(owner, repo, ref, target.path, 14000)}\n\`\`\`\n`;
  } else {
    const list = body.folderFiles ?? [];
    context += `## Selected folder: ${target.path || "(repo root)"}\nFiles (${list.length}):\n${list.slice(0, 200).join("\n")}\n`;
    const peek = list
      .filter((p) => /readme|index\.|main\.|__init__|routes?|app\./i.test(p))
      .slice(0, 4);
    for (const p of peek)
      context += `\n### ${p}\n\`\`\`\n${await raw(owner, repo, ref, p, 2500)}\n\`\`\`\n`;
  }
  context += `\n## It depends on (imports):\n${body.dependencies.join("\n") || "(none detected)"}\n`;
  const byHop = new Map<number, string[]>();
  for (const i of body.impacted) byHop.set(i.hop, [...(byHop.get(i.hop) ?? []), i.path]);
  context += `\n## Files that import it (impact chain):\n`;
  for (const [hop, ps] of [...byHop].sort((a, b) => a[0] - b[0]))
    context += `Hop ${hop} (${ps.length}):\n${ps.slice(0, 80).join("\n")}\n`;
  if (body.mode !== "explain") {
    const direct = body.impacted.filter((i) => i.hop === 1).slice(0, 5);
    const snippets = await Promise.all(direct.map((d) => raw(owner, repo, ref, d.path, 2000)));
    direct.forEach(
      (d, i) => (context += `\n### Direct dependent ${d.path}\n\`\`\`\n${snippets[i]}\n\`\`\`\n`),
    );
  }

  const task =
    body.mode === "explain"
      ? "Explain in plain English what this does, which feature of the app it belongs to, and its role. Keep it under 200 words. Use short headings and bullets."
      : body.mode === "impact"
        ? "The user plans to change this. Explain how far the ripple effect goes, which files and features most likely need updates and why, ranked by risk (high/medium/low). Mention what to test. Under 350 words, use bullets with file paths in backticks."
        : `Answer the user's question: ${body.question ?? ""}`;

  const provider = createOpenAI({
    apiKey,
  });

  const result = streamText({
    model: provider.responses(process.env["OPENAI_MODEL"] ?? "gpt-5-mini"),
    instructions:
      "You are a senior engineer helping someone understand a codebase's structure and change impact. Be concrete, reference file paths, and never invent files that aren't listed.",
    messages: [
      {
        role: "user",
        content: `Repository: ${owner}/${repo}@${ref}\n\n${context}\n\n## Task\n${task}`,
      },
    ],
    abortSignal: request.signal,
    providerOptions: {
      openai: {
        store: false,
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      },
    },
  });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") controller.enqueue(enc.encode(part.text));
          else if (part.type === "error") {
            const err = part.error;
            const status = APICallError.isInstance(err) ? err.statusCode : undefined;
            console.error("AI error", status, err);
            controller.enqueue(enc.encode(`\n\n⚠️ ${friendly(status)}`));
          }
        }
      } catch (err) {
        if (!request.signal.aborted) {
          const status = APICallError.isInstance(err) ? err.statusCode : undefined;
          console.error("AI stream failed", status, err);
          controller.enqueue(enc.encode(`\n\n⚠️ ${friendly(status)}`));
        }
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
