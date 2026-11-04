import { describe, it, expect, beforeEach } from 'vitest';
import { registerDirtyFormCheck, hasUnsavedChanges } from './PwaManager';

describe('PWA & Field Layout — Unit Tests', () => {
  beforeEach(() => {
    // Clear dirty form registry
  });

  it('correctly tracks unsaved form changes across registered checkers', () => {
    expect(hasUnsavedChanges()).toBe(false);

    let isDirty = true;
    const unregister = registerDirtyFormCheck(() => isDirty);

    expect(hasUnsavedChanges()).toBe(true);

    isDirty = false;
    expect(hasUnsavedChanges()).toBe(false);

    unregister();
    expect(hasUnsavedChanges()).toBe(false);
  });

  it('prevents multiple forms clashing and correctly combines dirty state', () => {
    let form1Dirty = false;
    let form2Dirty = false;

    const unreg1 = registerDirtyFormCheck(() => form1Dirty);
    const unreg2 = registerDirtyFormCheck(() => form2Dirty);

    expect(hasUnsavedChanges()).toBe(false);

    form2Dirty = true;
    expect(hasUnsavedChanges()).toBe(true);

    form1Dirty = true;
    form2Dirty = false;
    expect(hasUnsavedChanges()).toBe(true);

    unreg1();
    expect(hasUnsavedChanges()).toBe(false);

    unreg2();
  });
});
