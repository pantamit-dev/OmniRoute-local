import { test } from "node:test";
import assert from "node:assert/strict";
import * as yaml from "js-yaml";
import {
  postProcessHermesConfig,
  resolveHermesTarget,
  DEFAULT_HERMES_ROLE_MODELS,
} from "../../../bin/cli/commands/setup-hermes.mjs";

interface HermesConfigShape {
  _config_version?: number;
  agent?: { max_turns?: number };
  database?: { journal_mode?: string };
  terminal?: { backend?: string };
  model?: { default?: string; provider?: string; base_url?: string };
  delegation?: { model?: string; provider?: string };
  providers?: Record<string, { base_url?: string; api_key?: string }>;
  auxiliary?: Record<string, { model?: string; provider?: string }>;
  mcp_servers?: Record<string, { url?: string; headers?: Record<string, string> }>;
}

const SAMPLE_EXISTING_YAML = `_config_version: 49
agent:
  max_turns: 150
  verbose: false
database:
  journal_mode: wal
model:
  default: anthropic/claude-sonnet-5.5
  provider: openrouter
  base_url: https://openrouter.ai/api/v1
providers:
  openrouter:
    api: https://openrouter.ai/api/v1
    name: OpenRouter
terminal:
  backend: local
`;

test("DEFAULT_HERMES_ROLE_MODELS exposes all 18 roles mapped to auto-combos", () => {
  assert.equal(DEFAULT_HERMES_ROLE_MODELS.default, "auto/best-chat");
  assert.equal(DEFAULT_HERMES_ROLE_MODELS.delegation, "auto/best-coding");
  assert.equal(DEFAULT_HERMES_ROLE_MODELS.vision, "auto/best-vision");
  assert.equal(Object.keys(DEFAULT_HERMES_ROLE_MODELS).length, 18);
});

test("postProcessHermesConfig injects omniroute provider and references API key safely", () => {
  const { yaml: outputYaml } = postProcessHermesConfig(SAMPLE_EXISTING_YAML, {
    baseUrl: "http://localhost:20128",
    apiKey: "sk-omniroute-secret",
    useEnvRef: true,
  });

  const parsed = yaml.load(outputYaml) as HermesConfigShape;
  assert.ok(parsed.providers?.omniroute);
  assert.equal(parsed.providers.omniroute.base_url, "http://localhost:20128/v1");
  assert.equal(parsed.providers.omniroute.api_key, "${OMNIROUTE_API_KEY}");
  assert.equal(outputYaml.includes("sk-omniroute-secret"), false);
});

test("postProcessHermesConfig configures default, delegation, and auxiliary roles to omniroute", () => {
  const { yaml: outputYaml } = postProcessHermesConfig(SAMPLE_EXISTING_YAML, {
    baseUrl: "http://localhost:20128",
  });

  const parsed = yaml.load(outputYaml) as HermesConfigShape;
  // Default model
  assert.equal(parsed.model?.default, "auto/best-chat");
  assert.equal(parsed.model?.provider, "custom");
  assert.equal(parsed.model?.base_url, "http://localhost:20128/v1");

  // Delegation
  assert.equal(parsed.delegation?.model, "auto/best-coding");
  assert.equal(parsed.delegation?.provider, "custom");

  // Auxiliary roles
  assert.ok(parsed.auxiliary?.vision);
  assert.equal(parsed.auxiliary.vision.model, "auto/best-vision");
  assert.equal(parsed.auxiliary.vision.provider, "omniroute");

  assert.ok(parsed.auxiliary?.compression);
  assert.equal(parsed.auxiliary.compression.model, "auto/fast-chat");

  assert.ok(parsed.auxiliary?.web_extract);
  assert.equal(parsed.auxiliary.web_extract.model, "auto/fast-chat");

  assert.ok(parsed.auxiliary?.skills_hub);
  assert.equal(parsed.auxiliary.skills_hub.model, "auto/best-coding");

  assert.ok(parsed.auxiliary?.approval);
  assert.equal(parsed.auxiliary.approval.model, "auto/pro-reasoning");
});

test("postProcessHermesConfig injects omniroute MCP server endpoint (HTTP/SSE)", () => {
  const { yaml: outputYaml } = postProcessHermesConfig(SAMPLE_EXISTING_YAML, {
    baseUrl: "http://localhost:20128",
  });

  const parsed = yaml.load(outputYaml) as HermesConfigShape;
  assert.ok(parsed.mcp_servers?.omniroute);
  assert.equal(parsed.mcp_servers.omniroute.url, "http://localhost:20128/api/mcp/sse");
  assert.deepEqual(parsed.mcp_servers.omniroute.headers, {
    Authorization: "Bearer ${OMNIROUTE_API_KEY}",
  });
});

test("postProcessHermesConfig preserves existing user config sections", () => {
  const { yaml: outputYaml } = postProcessHermesConfig(SAMPLE_EXISTING_YAML, {
    baseUrl: "http://localhost:20128",
  });

  const parsed = yaml.load(outputYaml) as HermesConfigShape;
  assert.equal(parsed._config_version, 49);
  assert.equal(parsed.agent?.max_turns, 150);
  assert.equal(parsed.database?.journal_mode, "wal");
  assert.equal(parsed.terminal?.backend, "local");
  assert.ok(parsed.providers?.openrouter);
});

test("postProcessHermesConfig works cleanly on empty or fresh config", () => {
  const { yaml: outputYaml } = postProcessHermesConfig("", {
    baseUrl: "http://127.0.0.1:20128",
  });

  const parsed = yaml.load(outputYaml) as HermesConfigShape;
  assert.equal(parsed.model?.default, "auto/best-chat");
  assert.equal(parsed.providers?.omniroute?.base_url, "http://127.0.0.1:20128/v1");
  assert.equal(parsed.mcp_servers?.omniroute?.url, "http://127.0.0.1:20128/api/mcp/sse");
});

test("resolveHermesTarget resolves default localhost:20128", () => {
  const target = resolveHermesTarget({});
  assert.equal(target.baseUrl, "http://localhost:20128");
});

test("resolveHermesTarget strips trailing slashes and /v1 from remote", () => {
  const target = resolveHermesTarget({ remote: "http://vps.example.com:20128/v1///" });
  assert.equal(target.baseUrl, "http://vps.example.com:20128");
});

test("resolveHermesTarget honors explicit apiKey and hermesHome", () => {
  const target = resolveHermesTarget({
    apiKey: "sk-custom-key",
    "hermes-home": "/custom/hermes",
  });
  assert.equal(target.apiKey, "sk-custom-key");
  assert.equal(target.configPath, "/custom/hermes/config.yaml");
});
