import { Constants } from 'librechat-data-provider';
import { buildToolSearchContext } from './toolSearch';

describe('buildToolSearchContext', () => {
  it('returns a non-empty string', () => {
    const result = buildToolSearchContext();
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('mentions tool_search in the heading', () => {
    const result = buildToolSearchContext();
    expect(result).toContain(Constants.TOOL_SEARCH);
    expect(result).toMatch(/tool_search/);
  });

  it('mentions deferred tools and workflow', () => {
    const result = buildToolSearchContext();
    expect(result).toMatch(/deferred/i);
    expect(result).toContain('tool_search');
    expect(result).toContain('mcp_server');
  });
});
