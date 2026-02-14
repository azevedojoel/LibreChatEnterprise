#!/usr/bin/env node
/**
 * Test that createCodeExecutionTool accepts apiKey: 'local' (no throw).
 * Run: node test-execute-code-local.js
 */
const { createCodeExecutionTool } = require('@librechat/agents');

let threw = false;
try {
  const tool = createCodeExecutionTool({ user_id: 'test', files: [], apiKey: 'local' });
  if (!tool || typeof tool.invoke !== 'function') {
    console.error('FAIL: Tool invalid');
    process.exit(1);
  }
  console.log('OK: createCodeExecutionTool with apiKey: "local" - no throw');
} catch (err) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
