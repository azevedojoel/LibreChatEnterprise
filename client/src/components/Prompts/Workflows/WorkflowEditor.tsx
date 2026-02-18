import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toPng } from 'html-to-image';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  MarkerType,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plus, Loader2, Pencil, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Input,
  useToastContext,
  useTheme,
  isDark,
} from '@librechat/client';
import type { TWorkflow, TWorkflowNode, TWorkflowEdge } from 'librechat-data-provider';
import { useGetWorkflowQuery, useUpdateWorkflowMutation, useDeleteWorkflowMutation } from '~/data-provider';
import { useWorkflowEditorContext } from '~/Providers/WorkflowEditorContext';
import { useLocalize } from '~/hooks';
import { WorkflowNodeEditor, type WorkflowNodeEditorData } from './WorkflowNodeEditor';
import { AnimatedWorkflowEdge } from './AnimatedWorkflowEdge';

const nodeTypes = { 'workflow-step': WorkflowNodeEditor };
const edgeTypes = { animatedWorkflow: AnimatedWorkflowEdge };

function toFlowNodes(nodes: TWorkflowNode[]): Node<WorkflowNodeEditorData>[] {
  return nodes.map((n) => ({
    id: n.id,
    type: 'workflow-step',
    position: n.position,
    data: {
      promptGroupId: n.promptGroupId ?? '',
      agentId: n.agentId ?? '',
      selectedTools: n.selectedTools ?? null,
    },
  }));
}

function toFlowEdges(edges: TWorkflowEdge[]): Edge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: 'source-right',
    targetHandle: 'target-left',
    data: { feedOutputToNext: e.feedOutputToNext !== false },
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: 'var(--border-medium)' },
  }));
}

function toBackendNodes(nodes: Node<WorkflowNodeEditorData>[]): TWorkflowNode[] {
  return nodes.map((n) => ({
    id: n.id,
    promptGroupId: n.data.promptGroupId || null,
    agentId: n.data.agentId || null,
    position: n.position,
    selectedTools: n.data.selectedTools ?? null,
  }));
}

function toBackendEdges(edges: Edge[]): TWorkflowEdge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    feedOutputToNext: (e.data as { feedOutputToNext?: boolean })?.feedOutputToNext !== false,
  }));
}

function generateId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateEdgeId(source: string, target: string): string {
  return `e_${source}_${target}`;
}

function isWorkflowValid(nodes: Node<WorkflowNodeEditorData>[]): boolean {
  if (nodes.length === 0) return true;
  return nodes.every((n) => n.data.promptGroupId?.trim() && n.data.agentId?.trim());
}

/** Topological sort; returns node IDs in execution order. Handles disconnected nodes. */
function topologicalOrder(nodeIds: string[], edges: Edge[]): string[] {
  const idSet = new Set(nodeIds);
  const inDegree = new Map<string, number>();
  const outEdges = new Map<string, string[]>();

  for (const id of nodeIds) {
    inDegree.set(id, 0);
    outEdges.set(id, []);
  }

  for (const e of edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
    outEdges.get(e.source)!.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const id of nodeIds) {
    if (inDegree.get(id) === 0) queue.push(id);
  }

  const result: string[] = [];
  while (queue.length > 0) {
    const u = queue.shift()!;
    result.push(u);
    for (const v of outEdges.get(u) ?? []) {
      const d = (inDegree.get(v) ?? 1) - 1;
      inDegree.set(v, d);
      if (d === 0) queue.push(v);
    }
  }

  for (const id of nodeIds) {
    if (!result.includes(id)) result.push(id);
  }
  return result;
}

export default function WorkflowEditor() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const navigate = useNavigate();
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { theme } = useTheme();
  const colorMode = isDark(theme) ? 'dark' : 'light';

  const { data: workflow, isLoading: workflowLoading } = useGetWorkflowQuery(workflowId ?? '', {
    enabled: !!workflowId,
  });
  const updateMutation = useUpdateWorkflowMutation();
  const deleteMutation = useDeleteWorkflowMutation();
  const { setHasUnsavedChanges } = useWorkflowEditorContext();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const initialNodes = useMemo(
    () => (workflow?.nodes ? toFlowNodes(workflow.nodes) : []),
    [workflow?.nodes],
  );
  const initialEdges = useMemo(
    () => (workflow?.edges ? toFlowEdges(workflow.edges) : []),
    [workflow?.edges],
  );

  const [nodes, setNodes] = useState<Node<WorkflowNodeEditorData>[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);

  const handleEdgeFeedOutputToggle = useCallback((edgeId: string) => {
    setEdges((eds) =>
      eds.map((e) => {
        if (e.id !== edgeId) return e;
        const current = (e.data as { feedOutputToNext?: boolean })?.feedOutputToNext !== false;
        return { ...e, data: { ...e.data, feedOutputToNext: !current } };
      }),
    );
  }, []);

  const edgesWithMarkers = useMemo(() => {
    return edges.map((e) => {
      const feedOutput = (e.data as { feedOutputToNext?: boolean })?.feedOutputToNext !== false;
      return {
        ...e,
        type: 'animatedWorkflow',
        data: {
          ...e.data,
          feedOutputToNext: feedOutput,
          onFeedOutputToggle: handleEdgeFeedOutputToggle,
        },
        markerEnd: e.markerEnd ?? { type: MarkerType.ArrowClosed },
        style: feedOutput
          ? {
              ...(e.style ?? {}),
              stroke:
                (e.style as { stroke?: string } | undefined)?.stroke ?? 'var(--border-medium)',
            }
          : {
              ...(e.style ?? {}),
              stroke: 'var(--text-tertiary)',
              strokeDasharray: '8 4',
            },
      };
    });
  }, [edges, handleEdgeFeedOutputToggle]);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(workflow?.name ?? '');
  const reactFlowContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (workflow?.nodes) {
      setNodes(toFlowNodes(workflow.nodes));
    }
  }, [workflow?.nodes]);
  useEffect(() => {
    if (workflow?.edges) {
      setEdges(toFlowEdges(workflow.edges));
    }
  }, [workflow?.edges]);

  useEffect(() => {
    if (workflow?.name) {
      setEditName(workflow.name);
    }
  }, [workflow?.name]);

  const hasUnsavedChanges = useMemo(() => {
    if (!workflow) return false;
    const savedNodes = workflow.nodes ?? [];
    const savedEdges = workflow.edges ?? [];
    const currentNodes = toBackendNodes(nodes);
    const currentEdges = toBackendEdges(edges);
    const nodesMatch =
      JSON.stringify(currentNodes) === JSON.stringify(savedNodes);
    const edgesMatch =
      JSON.stringify(currentEdges) === JSON.stringify(savedEdges);
    const nameMatch = editName.trim() === (workflow.name ?? '').trim();
    return !nodesMatch || !edgesMatch || !nameMatch;
  }, [workflow, nodes, edges, editName]);

  useEffect(() => {
    setHasUnsavedChanges(hasUnsavedChanges);
    return () => setHasUnsavedChanges(false);
  }, [hasUnsavedChanges, setHasUnsavedChanges]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const handleConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    const id = generateEdgeId(connection.source, connection.target);
    const connectionWithHandles: Connection & { id?: string } = {
      ...connection,
      id,
      sourceHandle: connection.sourceHandle ?? 'source-right',
      targetHandle: connection.targetHandle ?? 'target-left',
    };
    setEdges((eds) => {
      const newEdges = addEdge(connectionWithHandles, eds);
      return newEdges.map((e) =>
        e.id === id ? { ...e, data: { ...(e.data ?? {}), feedOutputToNext: true } } : e,
      );
    });
  }, []);

  const handleAddNode = useCallback(() => {
    const n = nodes.length;
    const newNode: Node<WorkflowNodeEditorData> = {
      id: generateId(),
      type: 'workflow-step',
      position: { x: 200 + n * 260, y: 100 },
      data: {
        promptGroupId: '',
        agentId: '',
        selectedTools: null,
      },
    };
    setNodes((nds) => [...nds, newNode]);
  }, [nodes.length]);

  const handlePromptChange = useCallback((nodeId: string, promptGroupId: string) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, promptGroupId } } : n)),
    );
  }, []);

  const handleAgentChange = useCallback((nodeId: string, agentId: string) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, agentId } } : n)),
    );
  }, []);

  const handleSelectedToolsChange = useCallback(
    (nodeId: string, selectedTools: string[] | null) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, selectedTools } } : n)),
      );
    },
    [],
  );

  const { startNodeId, endNodeId } = useMemo(() => {
    if (nodes.length === 0) return { startNodeId: null, endNodeId: null };
    const order = topologicalOrder(
      nodes.map((n) => n.id),
      edges,
    );
    const first = order[0] ?? null;
    const last = order.length > 1 ? order[order.length - 1] : first;
    return { startNodeId: first, endNodeId: last };
  }, [nodes, edges]);

  const nodesWithHandlers = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          isStart: n.id === startNodeId,
          isEnd: n.id === endNodeId,
          onPromptChange: handlePromptChange,
          onAgentChange: handleAgentChange,
          onSelectedToolsChange: handleSelectedToolsChange,
        },
      })),
    [
      nodes,
      startNodeId,
      endNodeId,
      handlePromptChange,
      handleAgentChange,
      handleSelectedToolsChange,
    ],
  );

  const isValid = useMemo(() => isWorkflowValid(nodes), [nodes]);

  const handleSaveName = useCallback(() => {
    const trimmed = editName.trim();
    setIsEditingName(false);
    if (!workflowId || !trimmed || trimmed === workflow?.name) {
      setEditName(workflow?.name ?? '');
      return;
    }
    updateMutation.mutate(
      { id: workflowId, data: { name: trimmed } },
      {
        onSuccess: () => {
          setHasUnsavedChanges(false);
          showToast({ message: localize('com_ui_success'), status: 'success' });
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : localize('com_ui_error');
          showToast({ message: msg || localize('com_ui_error'), status: 'error' });
        },
      },
    );
  }, [workflowId, editName, workflow?.name, updateMutation, setHasUnsavedChanges, showToast, localize]);

  const handleDelete = useCallback(() => {
    if (!workflowId || workflowId === 'new') return;
    setDeleteDialogOpen(false);
    deleteMutation.mutate(workflowId, {
      onSuccess: () => {
        showToast({ message: localize('com_ui_workflows_deleted'), status: 'success' });
        navigate('/d/workflows');
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : localize('com_ui_workflows_delete_error');
        showToast({ message: msg, status: 'error' });
      },
    });
  }, [workflowId, deleteMutation, showToast, localize, navigate]);

  const handleSave = useCallback(async () => {
    if (!workflowId) return;
    if (!isValid) {
      showToast({
        message: localize('com_ui_workflows_validation_all_required'),
        status: 'error',
      });
      return;
    }

    let snapshotImage: string | undefined;
    if (nodes.length > 0) {
      const reactFlowElement = reactFlowContainerRef.current?.querySelector(
        '.react-flow',
      ) as HTMLElement | null;
      if (reactFlowElement) {
        try {
          const backgroundColor = colorMode === 'dark' ? '#0d0d0d' : '#ffffff';
          snapshotImage = await toPng(reactFlowElement, {
            filter: (node) => !node.classList?.contains('nocapture'),
            backgroundColor,
          });
        } catch {
          // Snapshot capture is best-effort; continue without it
        }
      }
    }

    updateMutation.mutate(
      {
        id: workflowId,
        data: {
          nodes: toBackendNodes(nodes),
          edges: toBackendEdges(edges),
          ...(snapshotImage && { snapshotImage }),
        },
      },
      {
        onSuccess: () => {
          setHasUnsavedChanges(false);
          showToast({ message: localize('com_ui_success'), status: 'success' });
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : localize('com_ui_error');
          showToast({ message: msg || localize('com_ui_error'), status: 'error' });
        },
      },
    );
  }, [workflowId, nodes, edges, isValid, colorMode, updateMutation, setHasUnsavedChanges, showToast, localize]);

  if (!workflowId) {
    navigate('/d/workflows');
    return null;
  }

  if (workflowLoading || !workflow) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-text-secondary" />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-light bg-surface-primary px-4 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {isEditingName ? (
            <>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName();
                  if (e.key === 'Escape') {
                    setEditName(workflow.name ?? '');
                    setIsEditingName(false);
                  }
                }}
                onBlur={handleSaveName}
                className="max-w-xs flex-1 bg-surface-secondary text-lg font-semibold text-text-primary placeholder:text-text-tertiary"
                autoFocus
              />
            </>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingName(true)}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left transition-colors hover:bg-surface-hover"
              aria-label={localize('com_ui_edit')}
            >
              <h1 className="truncate text-lg font-semibold text-text-primary">{workflow.name}</h1>
              <Pencil className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddNode}
            aria-label={localize('com_ui_workflows_add_step')}
          >
            <Plus className="mr-1 h-4 w-4" />
            {localize('com_ui_workflows_add_step')}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={updateMutation.isLoading || !isValid}
            title={!isValid ? localize('com_ui_workflows_validation_all_required') : undefined}
          >
            {updateMutation.isLoading ? localize('com_ui_loading') : localize('com_ui_save')}
          </Button>
          {workflowId !== 'new' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
              disabled={deleteMutation.isLoading}
              aria-label={localize('com_ui_delete')}
              className="text-red-500 hover:bg-red-500/10 hover:text-red-600"
            >
              <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
              {localize('com_ui_delete')}
            </Button>
          )}
        </div>
      </div>
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{localize('com_ui_delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {localize('com_ui_workflows_delete_confirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{localize('com_ui_cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-500 hover:bg-red-600 focus:ring-red-500"
            >
              {localize('com_ui_delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="flex h-[calc(100vh-120px)] w-full">
        <div ref={reactFlowContainerRef} className="relative min-w-0 flex-1">
          <ReactFlow
            nodes={nodesWithHandlers}
            edges={edgesWithMarkers}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.5 }}
            colorMode={colorMode}
          >
            <Background />
            <Controls className="nocapture" />
            <MiniMap className="nocapture" />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}
