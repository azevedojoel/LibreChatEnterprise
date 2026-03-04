# Coder Agent: Python Coding Environment for Daily Thread

The Coder agent (`system-coder`) is a specialized Python coding assistant that builds, iterates, and executes Python code in an isolated, conversation-scoped workspace. It does not write code directly—it delegates code generation to the `generate_code` tool (configured via `codeGeneration` in librechat.yaml) and acts as the orchestrator: planning, reviewing diffs, running Ruff lint, and executing Python scripts.

**Python only.** This workspace supports `.py` files exclusively. No JavaScript, TypeScript, or Node.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Environment Requirements](#environment-requirements)
3. [Ellis Handoff Flow](#ellis-handoff-flow)
4. [Tool Reference](#tool-reference)
5. [Workspace Conventions](#workspace-conventions)
6. [Example Flow](#example-flow)
7. [Implementation Notes](#implementation-notes)

---

## Architecture Overview

```mermaid
flowchart TB
    subgraph User [User]
        U[Chat with Ellis]
    end

    subgraph Ellis [Ellis - Default Agent]
        E[User: "Build a Python script that fetches weather"]
        H[Handoff to Coder]
    end

    subgraph Coder [Coder - Orchestrator]
        WS[workspace_status]
        WI[workspace_init]
        RI[Read handoff → requirements.md]
        CP[create_plan]
        GC[generate_code]
        L[lint - Ruff]
        RP[run_program]
        UT[update_todo]
    end

    subgraph Tools [Tool Layer]
        GC_Tool[generate_code: configured LLM]
        Lint_Tool[lint: Ruff]
        Run_Tool[run_program: Python]
    end

    U --> E
    E --> H
    H --> WS
    WS --> WI
    WI --> RI --> CP
    CP --> GC --> L --> UT
    L --> RP
```

**Key design decisions:**
- **Python only**: All code is Python. Lint uses Ruff. Run uses `python3` (or `python`).
- **Orchestrator model**: Coder uses `gpt-5-mini-2025-08-07` for planning and tool orchestration.
- **Code generation**: `generate_code` calls the configured LLM (OpenRouter, OpenAI, Anthropic, or DeepSeek)—Coder never writes code inline.
- **Workspace scope**: Conversation-scoped (`conv_{conversationId}`).
- **Lint gate**: `run_program` blocks if `lint_status.json` has `hasErrors: true`.

---

## Environment Requirements

### Required

| Dependency | Purpose |
|------------|---------|
| **git** | workspace_init, workspace_status, run_program (commit on success) |
| **python3** or **python** | Run Python scripts. `python3` is tried first, then `python`. Override with `PYTHON_CMD`. |
| **ruff** | Lint Python files. If not installed, lint returns a note and does not block run_program. |

### Code Generation Configuration (Required)

The `generate_code` tool requires `codeGeneration` in `librechat.yaml`. Without it, `generate_code` is not available.

```yaml
codeGeneration:
  provider: anthropic   # openrouter | openai | anthropic | deepseek
  model: claude-3-5-sonnet-20241022
```

| Provider   | Model examples                                      | API key env var                          |
|------------|-----------------------------------------------------|------------------------------------------|
| openrouter | `deepseek/deepseek-v3.2`, `anthropic/claude-3.5-sonnet` | `OPENROUTER_KEY` or `OPENROUTER_API_KEY` |
| openai     | `gpt-4o`, `gpt-4o-mini`                             | `OPENAI_API_KEY`                         |
| anthropic  | `claude-3-5-sonnet-20241022`, `claude-opus-4-6`     | `ANTHROPIC_API_KEY`                      |
| deepseek   | `deepseek-chat`                                     | `DEEPSEEK_API_KEY`                       |

### API Keys

| Variable | Purpose |
|----------|---------|
| `OPENROUTER_KEY` or `OPENROUTER_API_KEY` | When `codeGeneration.provider: openrouter` |
| `OPENAI_API_KEY` | When `codeGeneration.provider: openai` |
| `ANTHROPIC_API_KEY` | When `codeGeneration.provider: anthropic` |
| `DEEPSEEK_API_KEY` | When `codeGeneration.provider: deepseek` |

### Setup

**Local development (macOS/Linux):**
```bash
git --version
python3 --version   # or python
npm run setup:coder # Creates venv with ruff + standard libs (run once)
```

Ruff is installed into the code-exec venv via `api/server/services/LocalCodeExecution/requirements.txt`. The lint tool uses it automatically. Run `npm run setup:coder` once to pre-create the venv; otherwise it is created on first Coder use.

**Docker / deployment:**
Ensure the image has `git`, `python3`, and `pip`. The venv is created at runtime from `requirements.txt` (includes ruff). No extra Docker steps needed if Python is available.

**Override Python command:**
```bash
export PYTHON_CMD=python3   # or python, /usr/bin/python3, etc.
```

### Template Repo (Optional)

When `CODER_INIT_REPO_URL` is set, `workspace_init` and `reset_workspace` clone that repo instead of creating an empty workspace. Use a public repo (no auth required).

| Variable | Purpose |
|----------|---------|
| `CODER_INIT_REPO_URL` | Git URL to clone on init (e.g. `https://github.com/azevedojoel/python-starter.git`) |

**Default template**: [python-starter](https://github.com/azevedojoel/python-starter) — minimal Python CLI with `main.py`, `AGENT.md`, Ruff config.

**Flow**: If set and workspace is empty, `workspace_init` runs `git clone <url> .`. If clone fails (network, private repo), falls back to empty init. After init from template, Coder reads `AGENT.md` if present to understand the structure.

---

## Ellis Handoff Flow

Ellis is the default agent. When a user asks for Python scripts or automations, Ellis hands off to Coder.

### Handoff Trigger

Ellis transfers to Coder when the user needs:
- Python scripts or automations
- Data processing, APIs, CLI tools in Python

### Handoff Content (Option B)

Ellis includes the full requirements in the handoff message. Coder then:

1. Writes `requirements.md` via `workspace_create_file` from the handoff content
2. Calls `create_plan` to produce `plan.md` and `todo.json`
3. Executes the plan

### Reset Behavior

- `reset: true` in handoff → Coder calls `reset_workspace` before starting
- Default → Coder continues in the existing conversation workspace

---

## Tool Reference

### Coder-Specific Tools

| Tool | Schema | Behavior |
|------|--------|----------|
| **workspace_status** | (none) | Returns git status, todo list, last commit, plan summary |
| **workspace_init** | (none) | Clone template repo (if `CODER_INIT_REPO_URL` set) or `git init` + `.gitignore` |
| **reset_workspace** | (none) | Delete all files, clone template or re-init. Use only when handoff says `reset: true` |
| **create_plan** | `plan_content` | Write `plan.md`, parse into `todo.json` |
| **update_todo** | `item`, `status` | Update `todo.json` |
| **generate_code** | `file_path`, `request` | Call configured LLM, write Python file, return diff |
| **install_dependencies** | (none) | Create `.venv` and run `pip install -r requirements.txt`. Call after adding/updating requirements.txt |
| **lint** | `path` | Run Ruff on `.py` files, write `lint_status.json` |
| **run_program** | `path`, `args`? | Execute `.py` file; optional args for CLI; block if lint errors; commit on success. Uses workspace `.venv` when present |

### Workspace Tools (Reused)

| Tool | Coder Mapping |
|------|----------------|
| workspace_read_file | read_file |
| workspace_create_file | write_file (overwrites) |
| workspace_edit_file | edit_file |
| workspace_list_files, workspace_glob_files | list_files |
| workspace_send_file_to_user | Send outputs to user |
| workspace_pull_file | Pull from My Files |
| execute_code | Run ad-hoc Python (exploratory) |

---

## Workspace Conventions

Workspace path: `{SESSION_BASE_DIR}/conv_{conversationId}`

| File | Purpose |
|------|---------|
| `requirements.md` | Written by Coder from Ellis handoff; input to create_plan |
| `plan.md` | Human-readable plan from create_plan |
| `todo.json` | Todo list; schema: `{ items: [{ item, status }] }` |
| `lint_status.json` | Lint gate; schema: `{ hasErrors, lastLintedPath, errors }` |
| `AGENT.md` | From template; instructions for Coder (entry point, how to run) |
| `.gitignore` | Python-focused (venv, __pycache__, etc.) |

---

## Example Flow

### User Request

> "Build a Python script that fetches the current weather for a city and prints it. Use the Open-Meteo API."

### Step 1: Ellis Handoff

Ellis hands off to Coder with:

```
Build a Python script that fetches the current weather for a city and prints it.
Use the Open-Meteo API (https://open-meteo.com/). No API key required.
Input: city name (or lat/lon). Output: JSON with temperature, conditions.
```

### Step 2: Coder Entry

1. **workspace_status** → "Workspace empty. Call workspace_init to initialize."
2. **workspace_init** → "Workspace initialized." (or "Workspace initialized from template. Dependencies installed." if template has requirements.txt)
3. **workspace_create_file** path: `requirements.md`, content: (handoff content)
4. **create_plan** plan_content: (markdown plan with todos)
5. Display plan to user

### Step 3: Build Loop

1. **workspace_read_file** path: `plan.md` → get next todo
2. **generate_code** file_path: `main.py`, request: "Fetch weather from Open-Meteo API..."
3. If code needs new deps (e.g. `requests`): add to `requirements.txt`, call **install_dependencies**
4. Review diff in chat UI
5. **lint** path: `main.py` → "No lint errors." (or "Lint found X error(s)...")
6. If errors: **workspace_edit_file** to fix, re-lint
7. **update_todo** item: "Create main.py", status: complete

### Step 4: Execution

1. **lint** path: `main.py` → "No lint errors."
2. **run_program** path: `main.py`, args: `["London"]` (optional) → Executes with optional CLI args, workspace `.venv` (or system Python), commits on success, returns diff.

### Step 5: Deliver to User

- **workspace_send_file_to_user** path: `main.py` → User sees file in chat
- Or: Coder summarizes what was built and how to run it

---

## Implementation Notes

### Python Command

- Tries `python3` first, then `python`.
- Override with `PYTHON_CMD` env var.

### Ruff Not Installed

- `lint` returns `hasErrors: false` and adds note: `(Ruff not installed or failed)`.
- `run_program` does not block; execution is allowed.

### Preinstalled Packages

- `execute_code` (LocalCodeExecution) uses `requirements.txt` with numpy, pandas, requests, etc.
- `run_program` uses workspace `.venv` when present (created by template clone or `install_dependencies`); otherwise system Python.

### Lint Fixes

Use `workspace_edit_file`, not `generate_code`. `generate_code` has no file context; `workspace_edit_file` lets you read the file and apply targeted edits.

---

## Configuration Summary

| Config | Location | Purpose |
|--------|----------|---------|
| `codeGeneration` | librechat.yaml | **Required** for generate_code: provider, model |
| `OPENROUTER_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY` | .env | API key per provider |
| `PYTHON_CMD` | .env | Override Python command (optional) |
| `CODER_INIT_REPO_URL` | .env | Template repo to clone on init (optional) |
| `LIBRECHAT_CODE_SESSIONS_DIR` | .env | Base dir for workspace sessions |
| `system-coder` | librechat.yaml | Agent definition, tools, instructions |
