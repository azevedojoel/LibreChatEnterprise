/**
 * Topological sort for workflow nodes by edges.
 * Returns nodes in execution order (sources first; nodes with multiple incoming edges
 * run after all predecessors).
 *
 * @param {Array<{id: string}>} nodes - Workflow nodes
 * @param {Array<{source: string, target: string}>} edges - Workflow edges
 * @returns {string[]} Node IDs in execution order
 */
function topologicalSort(nodes, edges) {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const incoming = new Map();
  const outgoing = new Map();

  for (const id of nodeIds) {
    incoming.set(id, new Set());
    outgoing.set(id, new Set());
  }

  for (const { source, target } of edges) {
    if (nodeIds.has(source) && nodeIds.has(target)) {
      outgoing.get(source).add(target);
      incoming.get(target).add(source);
    }
  }

  const result = [];
  const completed = new Set();

  while (result.length < nodeIds.size) {
    const ready = [];
    for (const id of nodeIds) {
      if (completed.has(id)) continue;
      const deps = incoming.get(id);
      const allDepsDone = [...deps].every((d) => completed.has(d));
      if (allDepsDone) {
        ready.push(id);
      }
    }
    if (ready.length === 0) {
      break;
    }
    for (const id of ready) {
      result.push(id);
      completed.add(id);
    }
  }

  return result;
}

module.exports = { topologicalSort };
