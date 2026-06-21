import { describe, it, expect } from 'vitest';
import { PREDEFINED_CAN_ATTRIBUTES } from './predefinedAttributes.js';
import { ENUMS } from './mdcModel.js';

const REQUIRED_NAMES = [
  'BusType',
  'VFrameFormat',
  'GenMsgSendType',
  'GenMsgCycleTime',
  'MultiplexExtEnabled',
  'GenSigStartValue',
];

describe('PREDEFINED_CAN_ATTRIBUTES seed (MDC v3 — SPN is native, not seeded)', () => {
  it('includes every locked CANdb++ attribute name except SPN', () => {
    const names = PREDEFINED_CAN_ATTRIBUTES.map((d) => d.name);
    for (const name of REQUIRED_NAMES) {
      expect(names).toContain(name);
    }
    expect(names).not.toContain('SPN');
  });

  it('every entry has name + type with valid type and scopes', () => {
    for (const def of PREDEFINED_CAN_ATTRIBUTES) {
      expect(def.name).toBeTruthy();
      expect(def.type).toBeTruthy();
      expect(ENUMS.attributeType).toContain(def.type);
      for (const scope of def.scopes ?? []) {
        expect(ENUMS.attributeScope).toContain(scope);
      }
    }
  });

  it('enum-typed entries declare enumValues', () => {
    for (const def of PREDEFINED_CAN_ATTRIBUTES) {
      if (def.type !== 'enum') continue;
      expect(Array.isArray(def.enumValues)).toBe(true);
      expect(def.enumValues.length).toBeGreaterThan(0);
    }
  });
});
