import { describe, it, expect } from 'vitest';
import { validateProject } from './validate.js';
import { ENUMS } from './mdcModel.js';
import { SAMPLE_PROJECT } from './sampleProject.js';

function minimalProject(overrides = {}) {
  return {
    id: 'test_vehicle',
    schemaVersion: '3.0.0',
    networks: [
      {
        id: 'net1',
        baudrate: 500000,
        messages: [],
      },
    ],
    ...overrides,
  };
}

function attrDefIssues(project) {
  return validateProject(project).filter((i) => i.path.startsWith('attributeDefinitions'));
}

describe('validateProject attributeDefinitions (MDC v3)', () => {
  it('accepts every attribute type including hex', () => {
    for (const type of ENUMS.attributeType) {
      const def = { name: `Attr_${type}`, type };
      if (type === 'enum') def.enumValues = ['a'];
      const issues = attrDefIssues(minimalProject({ attributeDefinitions: [def] }));
      expect(issues, `type "${type}" should be valid`).toHaveLength(0);
    }
  });

  it('rejects removed / unknown attribute types', () => {
    const issues = attrDefIssues(
      minimalProject({ attributeDefinitions: [{ name: 'Legacy', type: 'valueType' }] }),
    );
    expect(issues.some((i) => i.message.includes('type must be one of'))).toBe(true);
  });

  it('rejects invalid attribute scopes', () => {
    const issues = attrDefIssues(
      minimalProject({
        attributeDefinitions: [{ name: 'BadScope', type: 'string', scopes: ['tag'] }],
      }),
    );
    expect(issues.some((i) => i.message.includes('scope "tag" is not valid'))).toBe(true);
  });
});

describe('validateProject v3 flat root', () => {
  it('accepts the bundled SAMPLE_PROJECT without errors', () => {
    const errors = validateProject(SAMPLE_PROJECT).filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('requires at least one network', () => {
    const issues = validateProject({ id: 'x', networks: [] });
    expect(issues.some((i) => i.message.includes('at least one network'))).toBe(true);
  });

  it('rejects invalid byte_order on a signal', () => {
    const issues = validateProject(
      minimalProject({
        networks: [
          {
            id: 'net1',
            messages: [
              {
                name: 'Msg',
                frame_id: 1,
                length: 8,
                signals: [
                  {
                    name: 'Sig',
                    start: 0,
                    length: 8,
                    byte_order: 'motorola',
                    is_signed: false,
                    is_float: false,
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    expect(issues.some((i) => i.message.includes('byte_order must be one of'))).toBe(true);
  });

  it('validates v3 signal field names', () => {
    const issues = validateProject(
      minimalProject({
        networks: [
          {
            id: 'net1',
            messages: [
              {
                name: 'Msg',
                frame_id: 1,
                length: 8,
                signals: [
                  {
                    name: 'Sig',
                    start: 0,
                    length: 8,
                    byte_order: 'little_endian',
                    is_signed: false,
                    is_float: false,
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });
});
