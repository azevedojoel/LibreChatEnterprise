import React, { createContext, useContext, useState, useCallback } from 'react';

interface WorkflowEditorContextValue {
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (value: boolean) => void;
}

const WorkflowEditorContext = createContext<WorkflowEditorContextValue | undefined>(undefined);

export function WorkflowEditorProvider({ children }: { children: React.ReactNode }) {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const value = {
    hasUnsavedChanges,
    setHasUnsavedChanges: useCallback((v: boolean) => setHasUnsavedChanges(v), []),
  };
  return (
    <WorkflowEditorContext.Provider value={value}>{children}</WorkflowEditorContext.Provider>
  );
}

export function useWorkflowEditorContext(): WorkflowEditorContextValue {
  const context = useContext(WorkflowEditorContext);
  if (!context) {
    return {
      hasUnsavedChanges: false,
      setHasUnsavedChanges: () => {},
    };
  }
  return context;
}
