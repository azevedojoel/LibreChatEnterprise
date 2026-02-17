# Content aggregator fix for tool_search / parallel tools

The fix for `ON_RUN_STEP_COMPLETED` index resolution needs to be applied in your [azevedojoel/agents](https://github.com/azevedojoel/agents) fork.

## Change to make in `src/stream.ts`

Replace the `ON_RUN_STEP_COMPLETED` block (approx. lines 723-741) with:

```typescript
    } else if (event === GraphEvents.ON_RUN_STEP_COMPLETED) {
      const { result } = data as unknown as { result: t.ToolEndEvent };

      const { id: stepId } = result;

      let targetIndex: number | undefined;

      const runStep = stepMap.get(stepId);
      if (runStep) {
        targetIndex = runStep.index;
      } else if (typeof result.index === 'number') {
        // Fallback: ToolEndEvent has content index when stepMap lookup fails
        // (e.g. parallel tools, child steps with different IDs)
        targetIndex = result.index;
      } else {
        // Last resort: find content part by tool_call.id with no output
        const toolCallId = result.tool_call?.id;
        const toolCallName = result.tool_call?.name;
        for (let i = 0; i < contentParts.length; i++) {
          const part = contentParts[i];
          const tc = part?.type === ContentTypes.TOOL_CALL ? (part as t.ToolCallContent).tool_call : undefined;
          if (!tc) continue;
          const hasOutput = tc.output != null && tc.output !== '';
          if (hasOutput) continue;
          if (toolCallId && tc.id === toolCallId) {
            targetIndex = i;
            break;
          }
          if (toolCallName && tc.name === toolCallName) {
            targetIndex = i;
            break;
          }
        }
      }

      if (targetIndex == null) {
        console.warn(
          'No run step or runId found for completed tool call event',
          { stepId, toolName: result.tool_call?.name }
        );
        return;
      }

      const contentPart: t.MessageContentComplex = {
        type: ContentTypes.TOOL_CALL,
        tool_call: result.tool_call,
      };

      updateContent(targetIndex, contentPart, true);
    }
```

## Steps

1. In your agents fork: `git checkout main && git pull`
2. Edit `src/stream.ts` and apply the change above
3. Run `npm run build` in the agents repo
4. Commit and push to your fork

Then LibreChatEnterprise will use the fork once package.json is updated.
