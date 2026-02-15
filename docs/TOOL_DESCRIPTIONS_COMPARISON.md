# Deep Comparison: Cursor Tool Descriptions vs LibreChat Workspace File Tools

This document compares the tool descriptions used by Cursor's built-in tools (Grep, Read, Glob, SemanticSearch) with LibreChat's workspace file manipulation tools. The goal is to identify gaps and offer engineering tips to improve LLM tool-use behavior.

---

## 1. Tool-Level Descriptions

### read_file

| Aspect | Cursor (Read) | LibreChat | Gap |
|--------|---------------|-----------|-----|
| Primary purpose | "Reads a file from the local filesystem" | "Read the contents of a file. Path is relative to the workspace root." | LibreChat explains workspace context; Cursor is generic |
| Line range | "Can optionally specify offset and limit for line ranges" | "Optionally specify start_line and end_line (1-based) to read a portion" | LibreChat is clearer about 1-based indexing |
| When to use | Implied: when you need file content | Not stated | **Missing: explicit "use when" guidance** |

**Engineering tip:** Add a "when to use" clause. LLMs benefit from disambiguation. Example: *"Use when you need to inspect file contents, verify edits, or read a specific section. Prefer start_line/end_line for large files to reduce token usage."*

---

### glob_files / glob_file_search

| Aspect | Cursor (Glob) | LibreChat | Gap |
|--------|---------------|-----------|-----|
| Speed/scale | "Works fast with codebases of any size" | Not stated | **Missing: performance expectation** |
| Output | "Returns matching file paths sorted by modification time" | Not stated (returns unsorted list) | **Missing: output format/sorting** |
| When to use | "Use when you need to find files by name patterns" | Not stated | **Missing: "when to use" vs list_files** |
| Pattern guidance | Implied via examples | "e.g. *.py, src/**/*.ts" | Good examples |

**Engineering tip:** Clarify **when to use glob_files vs list_files**. LLMs often confuse them. Suggested addition: *"Use glob_files for pattern-based discovery (e.g. all tests, all configs); use list_files to browse a single directory's contents. Results are limited to max_results (default 200)."*

---

### search_files / grep

| Aspect | Cursor (Grep) | LibreChat | Gap |
|--------|---------------|-----------|-----|
| Primary description | "Powerful search tool built on ripgrep" + "Use whenever possible instead of invoking grep" | "Search file contents for a pattern. Useful for finding definitions or usages." | LibreChat omits **preference over alternatives** |
| Capabilities summary | "Supports full regex, multiline, file type filters, output modes, context lines, pagination" | "Supports regex, context lines, and case-insensitive search" | **Missing: output format description** |
| When to use | "When you know exact symbols or strings" | "Useful for finding definitions or usages" | LibreChat is narrower; could add "or debugging, refactoring" |
| Semantic alternative | Grep vs SemanticSearch are contrasted | No semantic search tool | N/A |

**Engineering tip:** Describe the **output format** explicitly. Example: *"Returns matches as path:line: content. With context_lines > 0, shows surrounding lines separated by ---. Use for finding references, definitions, or debugging; prefer literal patterns unless regex is needed."*

---

### list_files

| Aspect | Cursor (no direct equivalent) | LibreChat | Gap |
|--------|-------------------------------|-----------|-----|
| Primary purpose | N/A | "List files and directories. Use to discover files before reading or editing." | Solid |
| Workspace context | N/A | "Use 'output' for Code Interpreter uploads and generated files" | **Very helpful** – domain-specific |
| Scope vs glob | N/A | Not contrasted with glob_files | **Missing: when to use list_files vs glob_files** |

**Engineering tip:** Add explicit contrast: *"Lists one directory at a time. Use list_files to explore a known path; use glob_files to find files by pattern across subdirectories."*

---

### edit_file / create_file / delete_file

| Aspect | Cursor | LibreChat | Gap |
|--------|--------|-----------|-----|
| edit_file | N/A | "Replace exact old_string with new_string. old_string must match exactly once." | Good constraint, but **no "when to use"** |
| create_file | N/A | "Create or overwrite. Parent directories created if needed." | Clear about overwrite behavior |
| delete_file | N/A | "Delete a file. Use for cleanup." | Minimal; could add caution |

**Engineering tip:** For edit_file, add guidance on **failure modes**: *"Fails if old_string appears 0 or 2+ times; use search_files first to verify. Whitespace must match exactly."* For delete_file: *"Permanent. Prefer for temporary/scratch files; confirm path before deleting."*

---

## 2. Parameter-Level Descriptions

### Pattern / path parameters

| Parameter | Cursor | LibreChat | Gap |
|-----------|--------|-----------|-----|
| pattern (search) | "The regular expression pattern" | "Search pattern (literal or regex when use_regex=true)" | Good – clarifies mode |
| path | "File or directory to search in" | "Directory or file to search (default: '.')" | LibreChat states default |
| extension | "Filter by extension (e.g. .js, .ts)" | "Filter by extension (e.g. 'py')" | Similar; Cursor uses leading dot |

**Engineering tip:** For extension, be consistent: either "py" or ".py" everywhere. Document that "py" means "*.py" to avoid confusion.

---

### Line range parameters

| Parameter | Cursor (Read) | LibreChat | Gap |
|-----------|---------------|-----------|-----|
| offset | "Line number to start reading from" | start_line: "1-based start line (inclusive)" | Cursor uses 0-based; LibreChat 1-based – **explicit is better** |
| limit | "Number of lines to read" | end_line: "1-based end line (inclusive)" | Different model: Cursor uses count; LibreChat uses range |

**Engineering tip:** LibreChat's range model (start_line, end_line) is clearer for "lines 10–20" use cases. Consider adding: *"Both inclusive. Omit for full file. start_line and end_line must be provided together for range, or omit both."* (Clarify if single-line read is start_line-only.)

---

### Advanced search parameters

| Parameter | Cursor | LibreChat | Gap |
|-----------|--------|-----------|-----|
| context_lines | "-A, -B, -C" (lines after, before, both) | "Lines before/after each match (default: 0)" | LibreChat uses single N for both – document symmetry |
| use_regex | Implied | "Treat pattern as regex (default: false)" | Good |
| case_sensitive | Implied | "Case-sensitive match (default: true)" | Good |
| max_results | head_limit | "Maximum matches to return (default: 50)" | Good |
| output_mode | "content \| files_with_matches \| count" | Not offered | **Feature gap** – LibreChat only returns content |

**Engineering tip:** If adding files_only or count modes later, document in the description. For context_lines: *"Number of lines before and after each match. Output format: path:line: content per line, with --- between match blocks."*

---

## 3. Structural Differences

### Cursor's patterns

1. **Explicit "when to use"** – Tools state their primary use case and when to prefer them over alternatives.
2. **Output format** – Descriptions often mention what the tool returns (e.g., "path:line: content", "sorted by modification time").
3. **Contrast with alternatives** – Grep vs SemanticSearch, Glob vs list-like behavior.
4. **Constraint callouts** – "must match exactly once", "permanent", etc.
5. **Defaults in description** – "default: 50", "default: false" appear in param descriptions.

### LibreChat's strengths

1. **Workspace context** – "Path is relative to workspace root" and "output directory" for Code Interpreter.
2. **1-based indexing** – Explicit "1-based" for line numbers.
3. **Domain-specific hints** – "output" directory for Code Interpreter.

### LibreChat's gaps

1. **No "when to use"** – Tools don't say when to pick them over alternatives.
2. **No output format** – search_files and glob_files don't describe return format.
3. **No list_files vs glob_files contrast** – Likely to cause confusion.
4. **Few failure-mode hints** – edit_file's "exactly once" is good; others could add more.
5. **Registry vs tool.js duplication** – Definitions exist in both; risk of drift.

---

## 4. Recommended Improvements (Prioritized)

### High impact

1. **Add "when to use" to each tool** – One sentence on primary use and when to prefer it.
2. **Document output format** – For search_files and glob_files, describe the return structure.
3. **Contrast list_files vs glob_files** – In both descriptions, clarify which to use when.

### Medium impact

4. **Add failure-mode guidance** – Especially for edit_file (whitespace, multiplicity) and delete_file (permanence).
5. **Clarify start_line/end_line** – Whether both are required for range, behavior when only one is set.
6. **Consolidate definitions** – Single source of truth (e.g., definitions.ts) with tool.js importing schema.

### Lower impact

7. **Add "do not use when"** – e.g., "Do not use read_file for searching; use search_files."
8. **Performance hints** – "Works with large codebases" for glob/search where relevant.
9. **Example outputs** – Short examples of search_files with context_lines in the description.

---

## 5. Example Rewrites

### read_file (improved)

```
Read file contents. Path is relative to workspace root.
Use when: inspecting a file, verifying edits, or reading a specific section.
Optionally use start_line and end_line (1-based, inclusive) to read a range—helps with large files.
```

### glob_files (improved)

```
Find files matching a glob pattern (e.g. *.py, src/**/*.ts).
Use when: discovering files by pattern (all tests, configs, etc.). Prefer over list_files when you need pattern matching across subdirectories.
Path: directory to search (default "."). Results limited to max_results (default 200).
```

### search_files (improved)

```
Search file contents for a pattern. Returns path:line: content per match.
Use when: finding definitions, usages, references, or debugging.
Supports: literal (default) or regex (use_regex=true), context_lines for surrounding lines, case_sensitive.
With context_lines > 0, output includes path:line blocks separated by ---.
```

### list_files (improved)

```
List files and subdirectories in one directory. Use to browse a known path.
Use when: exploring a directory; use glob_files when you need pattern-based discovery (e.g. *.py).
For Code Interpreter: use path "output" for uploads and generated files.
```

---

## 6. Implementation Notes

- **Single source of truth:** Keep tool descriptions in [packages/api/src/tools/registry/definitions.ts](packages/api/src/tools/registry/definitions.ts) and have [api/server/services/WorkspaceCodeEdit/tool.js](api/server/services/WorkspaceCodeEdit/tool.js) import them, or ensure both stay in sync via a shared constant.
- **Token budget:** Longer descriptions increase prompt size. Aim for 1–3 sentences per tool, 5–15 words per parameter.
- **Testing:** After updates, test with an agent that has all workspace tools; verify it picks the right tool for: "find all Python files", "read lines 10–20 of X", "search for function foo", "list what's in output/".
