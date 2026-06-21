import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEngineClient, useEngineStatus } from '../../lib/useEngine.jsx';

function notifyErr(label, e) {
  notifications.show({
    title: e.title || label,
    message: e.message,
    color: 'red',
  });
}

export default function SharepointSettings({ settings, onSettingsChange, onStatusChange }) {
  const client = useEngineClient();
  const { status: engineStatus } = useEngineStatus();
  const running = engineStatus.service_running;

  const [spStatus, setSpStatus] = useState(null);
  const [branches, setBranches] = useState(null);
  const [stashes, setStashes] = useState([]);
  const [remoteUrl, setRemoteUrl] = useState(settings?.sharepoint?.remoteUrl ?? '');
  const [branchPick, setBranchPick] = useState('');
  const [newBranch, setNewBranch] = useState('');
  const [stashMsg, setStashMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirtyModal, setDirtyModal] = useState(null);

  const updateSpStatus = useCallback(
    (st) => {
      setSpStatus(st);
      onStatusChange?.(st);
    },
    [onStatusChange],
  );

  const refreshStatus = useCallback(async () => {
    const st = await client.getSharepointStatus();
    updateSpStatus(st);
    return st;
  }, [client, updateSpStatus]);

  const refreshBranches = useCallback(async () => {
    const b = await client.getBranches();
    setBranches(b);
    setBranchPick(b.current);
    return b;
  }, [client]);

  const refreshStashes = useCallback(async () => {
    const res = await client.stash({ op: 'list' });
    setStashes(res.stashes ?? []);
  }, [client]);

  useEffect(() => {
    refreshStatus().catch((e) => notifyErr('Status', e));
    refreshBranches().catch(() => {});
    refreshStashes().catch(() => {});
  }, [refreshStatus, refreshBranches, refreshStashes]);

  useEffect(() => {
    setRemoteUrl(settings?.sharepoint?.remoteUrl ?? spStatus?.remoteUrl ?? '');
  }, [settings, spStatus?.remoteUrl]);

  const run = async (label, fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notifyErr(label, e);
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const saveRemote = () =>
    run('Save remote', async () => {
      const next = await client.updateSettings({
        sharepoint: { ...settings?.sharepoint, remoteUrl: remoteUrl.trim() },
      });
      onSettingsChange?.(next);
      notifications.show({ title: 'Saved', message: 'Remote URL updated', color: 'green' });
    });

  const doCheckout = (branch, dirty) =>
    run('Checkout', async () => {
      const st = await client.checkoutSharepoint({ branch, dirty });
      updateSpStatus(st);
      await refreshBranches();
      setDirtyModal(null);
      notifications.show({ title: 'Switched branch', message: branch, color: 'green' });
    });

  const switchBranch = () => {
    const target = branchPick?.replace(/^origin\//, '');
    if (!target) return;
    if (spStatus?.dirty) {
      setDirtyModal({ branch: target });
      return;
    }
    doCheckout(target).catch((e) => {
      if (e.status === 409 && e.title === 'Working tree dirty') {
        setDirtyModal({ branch: target });
      }
    });
  };

  const branchOptions = (() => {
    const seen = new Set();
    const opts = [];
    for (const b of branches?.local ?? []) {
      if (!seen.has(b)) {
        seen.add(b);
        opts.push({ value: b, label: b });
      }
    }
    for (const b of branches?.remote ?? []) {
      const name = b.replace(/^origin\//, '');
      if (!seen.has(name)) {
        seen.add(name);
        opts.push({ value: name, label: name });
      }
    }
    return opts;
  })();

  return (
    <Card withBorder>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600}>Embedded-Sharepoint</Text>
          <Group gap="xs">
            {spStatus?.branch ? (
              <Badge variant="outline" color="gray">
                {spStatus.branch}
              </Badge>
            ) : null}
            {spStatus?.dirty ? (
              <Badge color="yellow" variant="dot">
                dirty
              </Badge>
            ) : (
              <Badge color="green" variant="dot">
                clean
              </Badge>
            )}
            {spStatus?.commit ? (
              <Text size="xs" c="dimmed" ff="monospace">
                {spStatus.commit}
              </Text>
            ) : null}
          </Group>
        </Group>

        {running ? (
          <Text size="xs" c="yellow">
            Stop CAN ingest before changing the data checkout.
          </Text>
        ) : null}

        <TextInput
          label="Remote URL"
          value={remoteUrl}
          onChange={(e) => setRemoteUrl(e.currentTarget.value)}
          disabled={running}
        />
        <Group>
          <Button size="xs" onClick={saveRemote} disabled={running || busy}>
            Save remote
          </Button>
          <Button
            size="xs"
            variant="default"
            disabled={running || busy}
            onClick={() =>
              run('Clone', async () => {
                const st = await client.cloneSharepoint({ repair: true });
                updateSpStatus(st);
                await refreshBranches();
                notifications.show({ title: 'Re-cloned', color: 'green' });
              })
            }
          >
            Repair / Re-clone
          </Button>
        </Group>

        <Group align="flex-end" grow>
          <Select
            label="Branch"
            data={branchOptions}
            value={branchPick}
            onChange={(v) => v && setBranchPick(v)}
            searchable
            disabled={running}
          />
          <Button size="sm" variant="default" disabled={running || busy} onClick={() => run('Reload branches', refreshBranches)}>
            Reload
          </Button>
          <Button size="sm" disabled={running || busy} onClick={switchBranch}>
            Switch
          </Button>
        </Group>

        <Group grow align="flex-end">
          <TextInput
            label="New branch"
            value={newBranch}
            onChange={(e) => setNewBranch(e.currentTarget.value)}
            disabled={running}
          />
          <Button
            size="sm"
            disabled={running || busy || !newBranch.trim()}
            onClick={() =>
              run('Create branch', async () => {
                const st = await client.createBranch({ name: newBranch.trim(), checkout: true });
                updateSpStatus(st);
                setNewBranch('');
                await refreshBranches();
              })
            }
          >
            Create
          </Button>
        </Group>

        <Group>
          <Button
            size="xs"
            variant="default"
            disabled={running || busy}
            onClick={() => run('Fetch', async () => updateSpStatus(await client.fetchSharepoint()))}
          >
            Fetch
          </Button>
          <Button
            size="xs"
            variant="default"
            disabled={running || busy}
            onClick={() => run('Pull', async () => updateSpStatus(await client.pullSharepoint()))}
          >
            Pull
          </Button>
          <Button
            size="xs"
            disabled={running || busy}
            onClick={() =>
              run('Push', async () => {
                await client.pushSharepoint({ branch: spStatus?.branch });
                notifications.show({ title: 'Pushed', color: 'green' });
              })
            }
          >
            Push
          </Button>
          <Button
            size="xs"
            color="red"
            variant="default"
            disabled={running || busy}
            onClick={() =>
              run('Discard', async () => {
                const st = await client.discardSharepoint();
                updateSpStatus(st);
                await refreshStashes();
              })
            }
          >
            Revert / Discard
          </Button>
        </Group>

        <Stack gap="xs">
          <Text size="sm" fw={500}>
            Stash
          </Text>
          <Group grow align="flex-end">
            <TextInput
              label="Message"
              value={stashMsg}
              onChange={(e) => setStashMsg(e.currentTarget.value)}
              disabled={running}
            />
            <Button
              size="sm"
              disabled={running || busy}
              onClick={() =>
                run('Stash save', async () => {
                  const st = await client.stash({ op: 'save', message: stashMsg || undefined });
                  updateSpStatus(st);
                  setStashMsg('');
                  await refreshStashes();
                })
              }
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="default"
              disabled={running || busy}
              onClick={() =>
                run('Stash pop', async () => {
                  const st = await client.stash({ op: 'pop' });
                  updateSpStatus(st);
                  await refreshStashes();
                })
              }
            >
              Pop
            </Button>
          </Group>
          {stashes.length ? (
            <Stack gap={4}>
              {stashes.map((s) => (
                <Text key={s.ref} size="xs" c="dimmed" ff="monospace">
                  {s.ref}: {s.message}
                </Text>
              ))}
            </Stack>
          ) : (
            <Text size="xs" c="dimmed">
              No stashes
            </Text>
          )}
        </Stack>
      </Stack>

      <Modal
        opened={!!dirtyModal}
        onClose={() => setDirtyModal(null)}
        title="Working tree dirty"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            Save changes to stash or discard local edits under <code>can/</code> before switching
            to <strong>{dirtyModal?.branch}</strong>?
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDirtyModal(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              variant="default"
              loading={busy}
              onClick={() => doCheckout(dirtyModal.branch, 'discard')}
            >
              Discard
            </Button>
            <Button loading={busy} onClick={() => doCheckout(dirtyModal.branch, 'stash')}>
              Stash
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}
