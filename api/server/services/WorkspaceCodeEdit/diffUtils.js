/**
 * Shared diff utilities for workspace tools (generate_code, workspace_create_file, workspace_edit_file).
 */
const MAX_DIFF_LINES = 50;

function computeUnifiedDiff(filePath, oldContent, newContent) {
  const oldLines = (oldContent ?? '').split(/\r?\n/);
  const newLines = (newContent ?? '').split(/\r?\n/);
  const result = [];
  let i = 0;
  let j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      result.push(' ' + oldLines[i]);
      i++;
      j++;
    } else if (j < newLines.length && (i >= oldLines.length || !oldLines.slice(i).includes(newLines[j]))) {
      result.push('+' + newLines[j]);
      j++;
    } else if (i < oldLines.length && (j >= newLines.length || !newLines.slice(j).includes(oldLines[i]))) {
      result.push('-' + oldLines[i]);
      i++;
    } else if (i < oldLines.length && j < newLines.length) {
      result.push('-' + oldLines[i]);
      result.push('+' + newLines[j]);
      i++;
      j++;
    } else {
      break;
    }
  }
  const header = oldContent == null
    ? `--- /dev/null\n+++ b/${filePath}`
    : `--- a/${filePath}\n+++ b/${filePath}`;
  return header + '\n' + result.join('\n');
}

function truncateDiff(diff, maxLines = MAX_DIFF_LINES) {
  const lines = diff.split('\n');
  if (lines.length <= maxLines) {
    return { diff, truncated: false };
  }
  return {
    diff: lines.slice(0, maxLines).join('\n') + `\n... (${lines.length - maxLines} more lines)`,
    truncated: true,
    totalLines: lines.length,
  };
}

module.exports = { computeUnifiedDiff, truncateDiff, MAX_DIFF_LINES };
