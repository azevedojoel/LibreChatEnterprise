/**
 * Unit tests for abortRegistry - register, abort, unregister
 */
const { register, abort, unregister } = require('../abortRegistry');

describe('abortRegistry', () => {
  beforeEach(() => {
    unregister('run-1');
    unregister('run-2');
  });

  it('should register and abort a run', () => {
    const controller = new AbortController();
    register('run-1', controller);
    expect(abort('run-1')).toBe(true);
    expect(controller.signal.aborted).toBe(true);
  });

  it('should return false when aborting unregistered run', () => {
    expect(abort('run-nonexistent')).toBe(false);
  });

  it('should not register with falsy runId or controller', () => {
    const controller = new AbortController();
    register('', controller);
    register(null, controller);
    register('run-1', null);
    expect(abort('')).toBe(false);
    expect(abort('run-1')).toBe(false);
  });

  it('should unregister after abort', () => {
    const controller = new AbortController();
    register('run-1', controller);
    abort('run-1');
    unregister('run-1');
    expect(abort('run-1')).toBe(false);
  });

  it('should allow re-register after unregister', () => {
    const controller1 = new AbortController();
    register('run-1', controller1);
    unregister('run-1');
    const controller2 = new AbortController();
    register('run-1', controller2);
    expect(abort('run-1')).toBe(true);
  });

  it('should handle unregister with falsy runId', () => {
    expect(() => unregister(null)).not.toThrow();
    expect(() => unregister('')).not.toThrow();
  });
});
