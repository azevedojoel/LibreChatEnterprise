/**
 * Shared Ruff config for workspace pyproject.toml (workspace_init).
 * Template repos provide their own pyproject.toml; lint rules come from the workspace.
 */

const RUFF_SELECT = ['E', 'F', 'I', 'N', 'W'];
const RUFF_IGNORE = ['W292', 'I001'];
const RUFF_LINE_LENGTH = 100;
const RUFF_TARGET_VERSION = 'py39';

/** pyproject.toml [tool.ruff] section for workspace_init (empty workspaces) */
const DEFAULT_PYPROJECT_RUFF = `[tool.ruff]
line-length = ${RUFF_LINE_LENGTH}
target-version = "${RUFF_TARGET_VERSION}"

[tool.ruff.lint]
select = [${RUFF_SELECT.map((s) => `"${s}"`).join(', ')}]
ignore = [${RUFF_IGNORE.map((s) => `"${s}"`).join(', ')}]
`;

module.exports = {
  RUFF_SELECT,
  RUFF_IGNORE,
  RUFF_LINE_LENGTH,
  RUFF_TARGET_VERSION,
  DEFAULT_PYPROJECT_RUFF,
};
