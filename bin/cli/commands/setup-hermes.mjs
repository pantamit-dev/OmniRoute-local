/**
 * omniroute setup-hermes — Remote-aware Hermes Agent configuration generator.
 *
 * Configures ~/.hermes/config.yaml for the Nous Research Hermes Agent:
 *   - Injects omniroute provider (http://localhost:20128/v1 or remote)
 *   - Configures all 18 multi-roles to OmniRoute Auto Combos
 *   - Injects omniroute MCP server endpoint (/api/mcp/sse, 110 tools)
 *   - Keeps secrets off disk by referencing ${OMNIROUTE_API_KEY}
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import os from "node:os";
import * as yaml from "js-yaml";
import { printHeading, printInfo, printSuccess, printError } from "../io.mjs";
import { resolveActiveContext } from "../contexts.mjs";
import { guardHostConfigTarget } from "../utils/config-home-guard.mjs";

export const DEFAULT_HERMES_ROLE_MODELS = {
  default: "auto/best-chat",
  delegation: "auto/best-coding",
  vision: "auto/best-vision",
  compression: "auto/fast-chat",
  web_extract: "auto/fast-chat",
  skills_hub: "auto/best-coding",
  approval: "auto/pro-reasoning",
  mcp: "auto/best-coding",
  title_generation: "auto/fast-chat",
  memory_query_rewrite: "auto/fast-chat",
  tts_audio_tags: "auto/fast-chat",
  triage_specifier: "auto/pro-reasoning",
  kanban_decomposer: "auto/best-coding",
  profile_describer: "auto/fast-chat",
  goal_judge: "auto/pro-reasoning",
  curator: "auto/best-coding",
  monitor: "auto/fast-chat",
  background_review: "auto/best-coding",
};

/** Resolve baseUrl + apiKey + hermes paths from options / context / environment. */
export function resolveHermesTarget(opts = {}) {
  let baseUrl;
  if (opts.remote) {
    baseUrl = String(opts.remote).trim();
  } else {
    try {
      const c = resolveActiveContext(opts.context ?? process.env.OMNIROUTE_CONTEXT);
      baseUrl = c?.baseUrl;
    } catch {
      /* no context */
    }
    if (!baseUrl) {
      baseUrl = `http://localhost:${Number(opts.port ?? process.env.PORT ?? 20128) || 20128}`;
    }
  }

  while (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
  if (baseUrl.endsWith("/v1")) baseUrl = baseUrl.slice(0, -3);
  while (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);

  let apiKey = opts.apiKey ?? opts["api-key"];
  if (!apiKey) {
    try {
      const c = resolveActiveContext(opts.context ?? process.env.OMNIROUTE_CONTEXT);
      apiKey = c?.accessToken || c?.apiKey;
    } catch {
      /* no context auth */
    }
  }
  if (!apiKey) apiKey = process.env.OMNIROUTE_API_KEY || "";

  const hermesHome =
    (opts["hermes-home"] || opts.hermesHome || process.env.HERMES_HOME || "").trim() ||
    join(os.homedir(), ".hermes");
  const configPath =
    (opts["config-path"] || opts.configPath || "").trim() || join(hermesHome, "config.yaml");

  return { baseUrl, apiKey, hermesHome, configPath };
}

/**
 * Generate/merge Hermes Agent YAML config with OmniRoute gateway & MCP server.
 * Pure and testable.
 *
 * @param {string} existingYaml  raw existing config.yaml content
 * @param {object} opts
 * @returns {{ yaml: string, config: object }}
 */
export function postProcessHermesConfig(existingYaml, opts = {}) {
  let config = {};
  if (existingYaml && existingYaml.trim()) {
    try {
      config = yaml.load(existingYaml) || {};
    } catch {
      config = {};
    }
  }

  const rawBase = (opts.baseUrl || "http://localhost:20128").trim();
  let normalizedBase = rawBase;
  while (normalizedBase.endsWith("/")) normalizedBase = normalizedBase.slice(0, -1);
  if (normalizedBase.endsWith("/v1")) normalizedBase = normalizedBase.slice(0, -3);
  while (normalizedBase.endsWith("/")) normalizedBase = normalizedBase.slice(0, -1);

  const omnirouteUrl = `${normalizedBase}/v1`;
  const mcpUrl = `${normalizedBase}/api/mcp/sse`;

  const apiKeyVal =
    opts.useEnvRef !== false ? "${OMNIROUTE_API_KEY}" : opts.apiKey || "${OMNIROUTE_API_KEY}";

  // 1. Providers entry (both omniroute and custom alias for doctor compatibility)
  if (!config.providers) config.providers = {};
  config.providers.omniroute = {
    base_url: omnirouteUrl,
    api_key: apiKeyVal,
  };
  config.providers.custom = {
    base_url: omnirouteUrl,
    api_key: apiKeyVal,
  };

  // 2. Roles mapping
  const roles = { ...DEFAULT_HERMES_ROLE_MODELS, ...(opts.roles || {}) };
  if (opts.model) roles.default = opts.model;

  // default role
  config.model = {
    ...(config.model || {}),
    default: roles.default,
    provider: "custom",
    base_url: omnirouteUrl,
  };

  // delegation role
  config.delegation = {
    ...(config.delegation || {}),
    model: roles.delegation,
    provider: "custom",
    base_url: omnirouteUrl,
    api_key: apiKeyVal,
  };

  // auxiliary roles
  if (!config.auxiliary) config.auxiliary = {};
  for (const [role, model] of Object.entries(roles)) {
    if (role === "default" || role === "delegation") continue;
    config.auxiliary[role] = {
      ...(config.auxiliary[role] || {}),
      model,
      provider: "omniroute",
      base_url: omnirouteUrl,
      api_key: apiKeyVal,
    };
  }

  // 3. MCP Server entry
  if (!config.mcp_servers) config.mcp_servers = {};
  config.mcp_servers.omniroute = {
    url: mcpUrl,
    headers: {
      Authorization: `Bearer ${apiKeyVal}`,
    },
  };

  const outputYaml = yaml.dump(config, { lineWidth: -1, noRefs: true });
  return { yaml: outputYaml, config };
}

/** Execute setup-hermes command logic. */
export async function runSetupHermesCommand(opts = {}) {
  const target = resolveHermesTarget(opts);
  const { baseUrl, apiKey, configPath } = target;

  if (opts.guard !== false) {
    guardHostConfigTarget(configPath, { command: "setup-hermes", allowCustom: true });
  }

  printHeading("Hermes Agent Setup");
  printInfo(`Target OmniRoute URL : ${baseUrl}`);
  printInfo(`Hermes config path  : ${configPath}`);

  let existingYaml = "";
  if (existsSync(configPath)) {
    try {
      existingYaml = readFileSync(configPath, "utf8");
    } catch {
      existingYaml = "";
    }
  }

  const { yaml: outputYaml } = postProcessHermesConfig(existingYaml, {
    baseUrl,
    apiKey,
    model: opts.model,
    useEnvRef: !apiKey,
  });

  if (opts.dryRun || opts["dry-run"]) {
    printInfo("[dry-run] Configuration would be written to: " + configPath);
    console.log(outputYaml);
    return { target, yaml: outputYaml, written: false };
  }

  const configDir = dirname(configPath);
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  writeFileSync(configPath, outputYaml, "utf8");
  printSuccess(`Hermes Agent config saved to ${configPath}`);
  printInfo(`Configured 18 roles + MCP Server endpoint (/api/mcp/sse)`);
  return { target, yaml: outputYaml, written: true };
}

/** Register command with commander. */
export function registerSetupHermes(program) {
  program
    .command("setup-hermes")
    .description("Configure Hermes Agent (~/.hermes/config.yaml) to use OmniRoute (18 roles + MCP)")
    .option("--remote <url>", "Remote OmniRoute base URL")
    .option("--port <port>", "Local OmniRoute port (default: 20128)")
    .option("--api-key <key>", "OmniRoute API key")
    .option("--model <model>", "Default conversation model (default: auto/best-chat)")
    .option("--hermes-home <path>", "Path to Hermes home directory")
    .option("--config-path <path>", "Path to config.yaml")
    .option("--dry-run", "Print the configuration without writing to disk")
    .action(async (opts) => {
      try {
        await runSetupHermesCommand(opts);
      } catch (err) {
        printError(err.message || String(err));
        process.exitCode = 1;
      }
    });
}
