import { nanoid } from 'nanoid';
import { ContentTypes } from 'librechat-data-provider';
import type { TMessageContentParts } from 'librechat-data-provider';

/**
 * Ensures all tool_call IDs in content are unique. Mutates parts in place.
 */
function ensureUniqueToolCallIds(parts: TMessageContentParts[]): void {
  const seenIds = new Set<string>();
  const remapMap = new Map<string, string>();

  for (const part of parts) {
    if (part?.type !== ContentTypes.TOOL_CALL || !part.tool_call?.id) continue;

    const currentId = part.tool_call.id as string;
    if (seenIds.has(currentId)) {
      const newId = `toolu_${nanoid()}`;
      part.tool_call.id = newId;
      remapMap.set(currentId, newId);
    } else {
      seenIds.add(currentId);
    }
  }

  if (remapMap.size === 0) return;

  const seenInToolCallIds = new Map<string, number>();
  for (const part of parts) {
    if (part?.type !== ContentTypes.TEXT || !Array.isArray(part.tool_call_ids))
      continue;

    const ids = part.tool_call_ids as string[];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (!remapMap.has(id)) continue;

      const count = seenInToolCallIds.get(id) ?? 0;
      if (count >= 1) {
        ids[i] = remapMap.get(id)!;
      } else {
        seenInToolCallIds.set(id, count + 1);
      }
    }
  }
}

/**
 * Filters out malformed tool call content parts that don't have the required tool_call property.
 * This handles edge cases where tool_call content parts may be created with only a type property
 * but missing the actual tool_call data.
 *
 * @param contentParts - Array of content parts to filter
 * @returns Filtered array with malformed tool calls removed
 *
 * @example
 * // Removes malformed tool_call without the tool_call property
 * const parts = [
 *   { type: 'tool_call', tool_call: { id: '123', name: 'test' } }, // valid - kept
 *   { type: 'tool_call' }, // invalid - filtered out
 *   { type: 'text', text: 'Hello' }, // valid - kept (other types pass through)
 * ];
 * const filtered = filterMalformedContentParts(parts);
 * // Returns all parts except the malformed tool_call
 */
export function filterMalformedContentParts(
  contentParts: TMessageContentParts[],
): TMessageContentParts[];
export function filterMalformedContentParts<T>(contentParts: T): T;
export function filterMalformedContentParts<T>(
  contentParts: T | TMessageContentParts[],
): T | TMessageContentParts[] {
  if (!Array.isArray(contentParts)) {
    return contentParts;
  }

  ensureUniqueToolCallIds(contentParts);

  return contentParts.filter((part) => {
    if (!part || typeof part !== 'object') {
      return false;
    }

    const { type } = part;

    if (type === ContentTypes.TOOL_CALL) {
      return 'tool_call' in part && part.tool_call != null && typeof part.tool_call === 'object';
    }

    return true;
  });
}
