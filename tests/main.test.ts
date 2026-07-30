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
    expect(result.stderr).not.toContain("missing --exocortex-auth-openai");
  });

  test("rejects missing stdin before auth or network access", () => {
    const result = spawnSync(cli, ["generate"], {
      encoding: "utf8",
      input: "",
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("generate prompt is required on stdin");
    expect(result.stderr).not.toContain("missing --exocortex-auth-openai");
  });
});
