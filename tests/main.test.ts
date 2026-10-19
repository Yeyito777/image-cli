import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { decodePrompt, parseGenerateArgs } from "../src/main";

const cli = resolve(import.meta.dir, "../bin/image");

describe("image generate stdin prompts", () => {
  test("preserves exact UTF-8 without trimming or escape decoding", () => {
    const prompt = "  draw `$HOME` and ${USER}\\n\ninside ```code``` 👁️  \n";
    expect(decodePrompt(Buffer.from(prompt, "utf8"))).toBe(prompt);
  });

  test("parses control-plane options without a prompt argument", () => {
    expect(parseGenerateArgs(["--json", "--out", "/tmp/out.png"])).toEqual({
      json: true,
      outPath: "/tmp/out.png",
    });
  });

  test("rejects an inline prompt before auth or network access", () => {
    const result = spawnSync(cli, ["generate", "inline prompt"], {
      encoding: "utf8",
      input: "",
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("generate prompt must be provided via stdin; inline prompt is not accepted");
    expect(result.stderr).not.toContain("exocortexd");
  });

  test("rejects missing stdin before auth or network access", () => {
    const result = spawnSync(cli, ["generate"], {
      encoding: "utf8",
      input: "",
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("generate prompt is required on stdin");
    expect(result.stderr).not.toContain("exocortexd");
  });
});

describe("image generate through exocortexd", () => {
  test("asks the daemon over its socket, carries no credential, and saves the image", async () => {
    const { mkdtempSync, readFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "image-cli-test-"));
    const socketPath = join(dir, "d.sock");
    const requests: Record<string, unknown>[] = [];
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const server = Bun.listen({
      unix: socketPath,
      socket: {
        data(socket, data) {
          const command = JSON.parse(Buffer.from(data).toString("utf8").trim()) as Record<string, unknown>;
          requests.push(command);
          socket.write(`${JSON.stringify({ type: "ack", reqId: command.reqId })}\n`);
          socket.write(`${JSON.stringify({ type: "image_generation_result", reqId: command.reqId, imageBase64: png.toString("base64"), revisedPrompt: "r" })}\n`);
        },
      },
    });
    try {
      const out = join(dir, "out.png");
      // A pre-socket daemon still splices this; it must be ignored, not used.
      const child = Bun.spawn([cli, "--exocortex-auth-openai", "stale", "generate", "--json", "--out", out], {
        stdin: new TextEncoder().encode("a red square"),
        stdout: "pipe", stderr: "pipe",
        env: { ...process.env, EXOCORTEX_SOCKET: socketPath },
      });
      const [code, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
      expect(code).toBe(0);
      expect(JSON.parse(stdout)).toEqual({ path: out, mediaType: "image/png", revisedPrompt: "r" });
      expect(readFileSync(out)).toEqual(png);
      expect(requests).toEqual([{ type: "generate_image", prompt: "a red square", reqId: expect.any(String) }]);
    } finally {
      server.stop(true);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("reports a daemon error", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "image-cli-test-"));
    const socketPath = join(dir, "d.sock");
    const server = Bun.listen({
      unix: socketPath,
      socket: {
        data(socket, data) {
          const command = JSON.parse(Buffer.from(data).toString("utf8").trim()) as Record<string, unknown>;
          socket.write(`${JSON.stringify({ type: "error", reqId: command.reqId, message: "Image generation failed: Not logged in" })}\n`);
        },
      },
    });
    try {
      const child = Bun.spawn([cli, "generate"], {
        stdin: new TextEncoder().encode("x"), stdout: "pipe", stderr: "pipe",
        env: { ...process.env, EXOCORTEX_SOCKET: socketPath },
      });
      const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
      expect(code).toBe(1);
      expect(stderr).toContain("image: Image generation failed: Not logged in");
    } finally {
      server.stop(true);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
