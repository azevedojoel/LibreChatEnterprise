import { ContentTypes } from 'librechat-data-provider';
import type { PartWithIndex } from '../ParallelContent';

export type RenderItem =
  | { type: 'single'; part: PartWithIndex['part']; idx: number }
  | { type: 'group'; parts: PartWithIndex[] };

/**
 * Groups consecutive TOOL_CALL parts into single render items.
 * Runs of 2+ tool calls become a group; single tool calls and non-tool-call parts stay single.
 */
export function groupConsecutiveToolCalls(parts: PartWithIndex[]): RenderItem[] {
  const result: RenderItem[] = [];
  let run: PartWithIndex[] = [];

  for (const item of parts) {
    if (item.part.type === ContentTypes.TOOL_CALL) {
      run.push(item);
    } else {
      // Flush any accumulated tool calls first
      if (run.length === 1) {
        result.push({ type: 'single', part: run[0].part, idx: run[0].idx });
      } else if (run.length > 1) {
        result.push({ type: 'group', parts: [...run] });
      }
      run = [];
      result.push({ type: 'single', part: item.part, idx: item.idx });
    }
  }

  // Flush remaining run
  if (run.length === 1) {
    result.push({ type: 'single', part: run[0].part, idx: run[0].idx });
  } else if (run.length > 1) {
    result.push({ type: 'group', parts: run });
  }

  return result;
}
