---
title: "Hermes Agent & Workspace — Configuration with OmniRoute"
version: 3.8.51
lastUpdated: 2026-09-30
---

# Hermes Agent & Workspace — Configuration with OmniRoute

Connect the **Nous Research Hermes Agent** (`hermes`) and **Hermes Workspace** desktop/web interface to OmniRoute. OmniRoute acts as the central inference gateway, multi-role fallback router, and Model Context Protocol (MCP) server for Hermes.

---

## Quick start

```bash
# Configure Hermes Agent to use local OmniRoute with 18 Auto-Combo roles + MCP server
omniroute setup-hermes

# Preview configuration without writing to disk
omniroute setup-hermes --dry-run

# Connect to a remote OmniRoute (e.g. VPS or Tailnet)
omniroute setup-hermes --remote http://192.168.0.15:20128 --api-key sk-xxx

# Run Hermes Agent diagnostic check
hermes doctor

# Verify connected MCP servers
hermes mcp list
```

---

## Architecture Overview

OmniRoute integrates with the Hermes ecosystem across four foundational layers:

1. **Central Inference Gateway (`/v1`)**:
   Hermes Agent connects to OmniRoute via an OpenAI-compatible endpoint (`http://localhost:20128/v1`). Requests are load-balanced and routed through OmniRoute's 19 Auto-Combo strategies with zero-downtime provider failover (OpenRouter, Ollama, Anthropic, OpenAI, etc.).
2. **18 Multi-Role Specialization**:
   Hermes Agent v0.21+ supports independent model assignments across 18 distinct agent tasks. OmniRoute maps each role to specialized auto-combos (`auto/best-chat`, `auto/best-coding`, `auto/best-vision`, `auto/fast-chat`, `auto/pro-reasoning`).
3. **Model Context Protocol (MCP Server)**:
   Hermes Agent connects to OmniRoute's MCP server over HTTP/SSE (`/api/mcp/sse`), gaining direct access to 110 tools across routing, quotas, health checks, web search, memory, and combos.
4. **Hermes Workspace (Web UI / Conductor)**:
   Hermes Workspace (`PORT=3002`) interfaces with the Hermes Gateway (`PORT=8642`) and dashboard (`PORT=9119`), with underlying completions routed through OmniRoute.

---

## Multi-Role Configuration Reference

The `omniroute setup-hermes` command automatically updates `~/.hermes/config.yaml` with the following role mappings:

| Role                   | Default Model        | Description                                                        |
| :--------------------- | :------------------- | :----------------------------------------------------------------- |
| `default`              | `auto/best-chat`     | Primary user conversation and task execution                       |
| `delegation`           | `auto/best-coding`   | Sub-agent spawning and multi-agent orchestration                   |
| `vision`               | `auto/best-vision`   | Image, screenshot, and visual artifact analysis                    |
| `compression`          | `auto/fast-chat`     | Context window compression and conversation pruning                |
| `web_extract`          | `auto/fast-chat`     | Web page extraction and markdown content parsing                   |
| `skills_hub`           | `auto/best-coding`   | Community skill reasoning and tool invocation                      |
| `approval`             | `auto/pro-reasoning` | Safety boundaries, dangerous command approval, and policy verdicts |
| `mcp`                  | `auto/best-coding`   | MCP tool call execution                                            |
| `title_generation`     | `auto/fast-chat`     | Background session title generation                                |
| `memory_query_rewrite` | `auto/fast-chat`     | Memory search query rewriting                                      |
| `tts_audio_tags`       | `auto/fast-chat`     | Voice and audio tag synthesis                                      |
| `triage_specifier`     | `auto/pro-reasoning` | Issue and PR triage classification                                 |
| `kanban_decomposer`    | `auto/best-coding`   | Kanban task decomposition                                          |
| `profile_describer`    | `auto/fast-chat`     | User persona description                                           |
| `goal_judge`           | `auto/pro-reasoning` | Task and goal completion verification                              |
| `curator`              | `auto/best-coding`   | Memory and skill curation                                          |
| `monitor`              | `auto/fast-chat`     | Background health and loop monitoring                              |
| `background_review`    | `auto/best-coding`   | Asynchronous code review                                           |

---

## MCP Server Integration

Hermes Agent configures OmniRoute MCP under the `mcp_servers` section of `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  omniroute:
    url: http://localhost:20128/api/mcp/sse
    headers:
      Authorization: Bearer ${OMNIROUTE_API_KEY}
```

This grants Hermes Agent access to essential OmniRoute operations:

- `omniroute_check_quota`: Inspect active quota and remaining tokens.
- `omniroute_get_health`: Inspect circuit breakers, upstream latency, and error states.
- `omniroute_list_combos` & `omniroute_switch_combo`: Inspect and change active routing combos.
- `omniroute_web_search` & `omniroute_web_fetch`: Perform live web search through OmniRoute.
- `omniroute_cost_report`: Track cost per session, model, or provider.

---

## Hermes Workspace Configuration

Hermes Workspace runs on port `3002` (defined in `/home/psave/.docker/hermes-workspace/.env`). It communicates with the Hermes Gateway on port `8642`.

To align Workspace with OmniRoute:

1. Ensure `HERMES_API_URL=http://127.0.0.1:8642` and `HERMES_API_TOKEN` match `~/.hermes/.env`.
2. Configure `OMNIROUTE_BASE_URL=http://127.0.0.1:20128/v1` in `hermes-workspace/.env`.
3. Launch Workspace via `pnpm start` or Docker Compose.

---

## Troubleshooting & Diagnostics

Run `hermes doctor` to verify health across Python virtual environment, SQLite database, provider connectivity, and MCP servers:

```bash
hermes doctor
```

Verify that `auxiliary task routing resolves: ... custom@localhost` and that `mcp_servers.omniroute` reports `✓ enabled` in `hermes mcp list`.
