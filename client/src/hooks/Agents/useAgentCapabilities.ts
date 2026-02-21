import { useMemo } from 'react';
import { AgentCapabilities } from 'librechat-data-provider';

interface AgentCapabilitiesResult {
  toolsEnabled: boolean;
  actionsEnabled: boolean;
  artifactsEnabled: boolean;
  ocrEnabled: boolean;
  contextEnabled: boolean;
  fileSearchEnabled: boolean;
  webSearchEnabled: boolean;
  codeEnabled: boolean;
  deferredToolsEnabled: boolean;
  programmaticToolsEnabled: boolean;
  manageSchedulingEnabled: boolean;
  manageCRMEnabled: boolean;
  inboundEmailEnabled: boolean;
}

export default function useAgentCapabilities(
  capabilities: AgentCapabilities[] | undefined,
): AgentCapabilitiesResult {
  const toolsEnabled = useMemo(
    () => capabilities?.includes(AgentCapabilities.tools) ?? false,
    [capabilities],
  );

  const actionsEnabled = useMemo(
    () => capabilities?.includes(AgentCapabilities.actions) ?? false,
    [capabilities],
  );

  const artifactsEnabled = useMemo(
    () => capabilities?.includes(AgentCapabilities.artifacts) ?? false,
    [capabilities],
  );

  const ocrEnabled = useMemo(
    () => capabilities?.includes(AgentCapabilities.ocr) ?? false,
    [capabilities],
  );

  const contextEnabled = useMemo(
    () => capabilities?.includes(AgentCapabilities.context) ?? false,
    [capabilities],
  );

  const fileSearchEnabled = useMemo(
    () => capabilities?.includes(AgentCapabilities.file_search) ?? false,
    [capabilities],
  );

  const webSearchEnabled = useMemo(
    () => capabilities?.includes(AgentCapabilities.web_search) ?? false,
    [capabilities],
  );

  const codeEnabled = useMemo(
    () => capabilities?.includes(AgentCapabilities.execute_code) ?? false,
    [capabilities],
  );

  const deferredToolsEnabled = useMemo(
    () => capabilities?.includes(AgentCapabilities.deferred_tools) ?? false,
    [capabilities],
  );

  const programmaticToolsEnabled = useMemo(
    () => capabilities?.includes(AgentCapabilities.programmatic_tools) ?? false,
    [capabilities],
  );

  const manageSchedulingEnabled = useMemo(
    () => capabilities?.includes(AgentCapabilities.manage_scheduling) ?? false,
    [capabilities],
  );

  const manageCRMEnabled = useMemo(
    () => capabilities?.includes(AgentCapabilities.manage_crm) ?? false,
    [capabilities],
  );

  const inboundEmailEnabled = useMemo(
    () => capabilities?.includes(AgentCapabilities.inbound_email) ?? false,
    [capabilities],
  );

  return {
    ocrEnabled,
    codeEnabled,
    toolsEnabled,
    actionsEnabled,
    contextEnabled,
    artifactsEnabled,
    webSearchEnabled,
    fileSearchEnabled,
    deferredToolsEnabled,
    programmaticToolsEnabled,
    manageSchedulingEnabled,
    manageCRMEnabled,
    inboundEmailEnabled,
  };
}
