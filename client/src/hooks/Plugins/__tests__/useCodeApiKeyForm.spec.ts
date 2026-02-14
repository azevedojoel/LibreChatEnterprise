/**
 * useCodeApiKeyForm - stub for backward compatibility (code runs locally, no API key)
 */
import { renderHook } from '@testing-library/react';
import useCodeApiKeyForm from '../useCodeApiKeyForm';

describe('useCodeApiKeyForm', () => {
  it('returns stub interface for BadgeRowContext compatibility', () => {
    const { result } = renderHook(() => useCodeApiKeyForm({}));

    expect(result.current).toMatchObject({
      methods: expect.anything(),
      isDialogOpen: false,
      setIsDialogOpen: expect.any(Function),
      handleRevokeApiKey: expect.any(Function),
      onSubmit: expect.any(Function),
      badgeTriggerRef: expect.any(Object),
      menuTriggerRef: expect.any(Object),
    });
  });

  it('onSubmit is a no-op (no API key to install)', () => {
    const { result } = renderHook(() => useCodeApiKeyForm({}));

    expect(() => result.current.onSubmit()).not.toThrow();
  });

  it('handleRevokeApiKey is a no-op (no API key to revoke)', () => {
    const { result } = renderHook(() => useCodeApiKeyForm({}));

    expect(() => result.current.handleRevokeApiKey()).not.toThrow();
  });

  it('does not call useAuthCodeTool (removed)', () => {
    const { result } = renderHook(() => useCodeApiKeyForm({}));

    expect(result.current).not.toHaveProperty('installTool');
    expect(result.current).not.toHaveProperty('removeTool');
  });
});
