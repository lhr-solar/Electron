import { describe, it, expect } from 'vitest';
import { setIn } from './mdcModel.js';

/** Pure-logic mirror of NetworkEditor environment-variable mutations. */
function addEnvVar(network) {
  const envVars = network.environment_variables ?? [];
  return {
    ...network,
    environment_variables: [
      ...envVars,
      { name: 'NewEnvVar', env_type: 'integer', access_node: [], comment: '' },
    ],
  };
}

function updateEnvVar(network, index, key, value) {
  const envVars = [...(network.environment_variables ?? [])];
  envVars[index] = { ...envVars[index], [key]: value };
  return { ...network, environment_variables: envVars };
}

function minimalNetwork() {
  return { id: 'bus1', baudrate: 500000, messages: [] };
}

describe('environment variable editor mutations', () => {
  it('adds a default env var with cantools-shaped fields', () => {
    const next = addEnvVar(minimalNetwork());
    expect(next.environment_variables).toHaveLength(1);
    expect(next.environment_variables[0]).toMatchObject({
      name: 'NewEnvVar',
      env_type: 'integer',
      access_node: [],
      comment: '',
    });
  });

  it('edits env var fields on the model via setIn', () => {
    let project = {
      id: 'v',
      networks: [addEnvVar(minimalNetwork())],
    };
    project = setIn(project, ['networks', 0, 'environment_variables', 0, 'name'], 'EngineSpeed');
    project = setIn(project, ['networks', 0, 'environment_variables', 0, 'minimum'], 0);
    project = setIn(project, ['networks', 0, 'environment_variables', 0, 'maximum'], 8000);
    project = setIn(project, ['networks', 0, 'environment_variables', 0, 'unit'], 'rpm');

    const ev = project.networks[0].environment_variables[0];
    expect(ev.name).toBe('EngineSpeed');
    expect(ev.minimum).toBe(0);
    expect(ev.maximum).toBe(8000);
    expect(ev.unit).toBe('rpm');
  });

  it('updateEnvVar helper edits without mutating input', () => {
    const base = addEnvVar(minimalNetwork());
    const next = updateEnvVar(base, 0, 'env_id', 42);
    expect(next.environment_variables[0].env_id).toBe(42);
    expect(base.environment_variables[0].env_id).toBeUndefined();
  });
});
