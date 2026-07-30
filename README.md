# image-cli

Exocortex external tool for OpenAI-backed raster image generation.

## Usage

```bash
printf '%s' 'a tiny red square icon' | image generate
```

`image generate` reads the exact UTF-8 prompt from stdin. Inline prompt
arguments are rejected. Use `--out PATH` to choose the output path and
`--json` for structured output.

The tool expects Exocortex daemon-provided OpenAI auth via `--exocortex-auth-openai` and is normally invoked from inside Exocortex.
