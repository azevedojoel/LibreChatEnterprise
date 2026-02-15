/**
 * Builds prompt context for Schedule Manager agents listing which agents they can schedule.
 * Injected into toolContextMap so the agent sees target agent ids and names in its instructions.
 *
 * @param {string[]} [schedulerTargetAgentIds] - Agent IDs the scheduler can schedule
 * @param {(filter: { id: { $in: string[] } }) => Promise<Array<{ id: string; name?: string; description?: string }>>} getAgents - Function to fetch agents
 * @returns {Promise<string|null>} Formatted context string or null if empty
 */
async function buildSchedulerTargetContext(schedulerTargetAgentIds, getAgents) {
  const ids = Array.isArray(schedulerTargetAgentIds)
    ? schedulerTargetAgentIds.filter((id) => id != null && typeof id === 'string')
    : [];
  if (ids.length === 0) {
    return null;
  }

  try {
    const agents = await getAgents({ id: { $in: ids } });
    const parts = agents.map((a) => {
      const line = `[${a?.id ?? 'unknown'}] ${a?.name ?? 'Unnamed'}`.trim();
      const desc = (a?.description ?? '').trim();
      return desc ? `${line}\n${desc}` : line;
    });
    if (parts.length === 0) {
      return null;
    }
    const agentList = parts.join('\n\n');
    return `# Schedule Manager Constraints
- The agents listed below are the ONLY agents you can schedule. You have no knowledge of any other agents.
- NEVER ask the user which agent to run. Infer which agent from their request (e.g. "schedule my daily marketing report" → Marketing Bot).
- NEVER ask for agent name or ID. Map user intent to the correct agentId using the list below.
- When asked what you can schedule, list ONLY these agents. Do not mention or suggest any other agents.

# Agents you can schedule (use agentId in create_schedule/update_schedule)
${agentList}`;
  } catch (err) {
    return null;
  }
}

module.exports = { buildSchedulerTargetContext };
