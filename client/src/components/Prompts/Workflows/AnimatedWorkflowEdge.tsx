import { useCallback } from 'react';
import { cn } from '~/utils';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getEdgeCenter,
  getSmoothStepPath,
  type EdgeProps,
  MarkerType,
} from '@xyflow/react';

/**
 * Workflow edge with optional animated dot along the path to indicate flow direction,
 * and a clickable connector point to toggle "Feed output to next step".
 */
export function AnimatedWorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const [edgeCenterX, edgeCenterY] = getEdgeCenter({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  const feedOutputToNext = (data as { feedOutputToNext?: boolean })?.feedOutputToNext !== false;
  const onFeedOutputToggle = (data as { onFeedOutputToggle?: (edgeId: string) => void })
    ?.onFeedOutputToggle;
  const strokeColor = (style as { stroke?: string })?.stroke ?? 'var(--border-medium)';

  const handleToggleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onFeedOutputToggle?.(id);
    },
    [id, onFeedOutputToggle],
  );

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd ?? { type: MarkerType.ArrowClosed }}
        style={style}
      />
      {feedOutputToNext && (
        <circle r="2.5" fill={strokeColor} opacity={0.8}>
          <animateMotion dur="2.5s" repeatCount="indefinite" path={edgePath} />
        </circle>
      )}
      {onFeedOutputToggle && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${edgeCenterX}px,${edgeCenterY}px)`,
              pointerEvents: 'all',
            }}
          >
            <button
              type="button"
              onClick={handleToggleClick}
              className={cn(
                'flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border-2 transition-all hover:scale-110',
                feedOutputToNext ? 'border-border-medium' : 'border-dashed border-border-light',
              )}
              style={
                feedOutputToNext
                  ? { borderColor: strokeColor, backgroundColor: strokeColor }
                  : undefined
              }
              aria-label={
                feedOutputToNext
                  ? 'Feed output: on (click to turn off)'
                  : 'Feed output: off (click to turn on)'
              }
            />
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
