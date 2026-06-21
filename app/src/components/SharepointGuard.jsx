import { useCallback, useEffect, useState } from 'react';
import {
  Anchor,
  Button,
  Center,
  Loader,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useEngineClient } from '../lib/useEngine.jsx';

const GIT_URL = 'https://git-scm.com/downloads';

function BlockingScreen({ title, children }) {
  return (
    <Center style={{ height: '100vh', background: 'var(--bg)' }}>
      <Stack gap="md" maw={480} p="xl" align="stretch">
        <Title order={2}>{title}</Title>
        {children}
      </Stack>
    </Center>
  );
}

export default function SharepointGuard({ children }) {
  const client = useEngineClient();
  const [status, setStatus] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [remoteUrl, setRemoteUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [st, cfg] = await Promise.all([client.getSharepointStatus(), client.getSettings()]);
      setStatus(st);
      setSettings(cfg);
      setRemoteUrl(cfg?.sharepoint?.remoteUrl ?? st?.remoteUrl ?? '');
      setBranch(cfg?.sharepoint?.branch ?? st?.branch ?? '');
    } catch (e) {
      setError(e.message || 'Failed to reach backend');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    load();
  }, [load]);

  const runClone = async (repair = false) => {
    setBusy(true);
    setError(null);
    try {
      const st = await client.cloneSharepoint({
        remoteUrl: remoteUrl.trim() || undefined,
        branch: branch.trim() || undefined,
        repair,
      });
      setStatus(st);
      if (st.gitInstalled && st.cloned && st.canRootExists) return;
      setError('Clone finished but checkout is still invalid — try Repair or check git output.');
    } catch (e) {
      setError(e.message || 'Clone failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Center style={{ height: '100vh', background: 'var(--bg)' }}>
        <Loader color="gray" />
      </Center>
    );
  }

  if (error && !status) {
    return (
      <BlockingScreen title="Backend unavailable">
        <Text c="dimmed">{error}</Text>
        <Button onClick={load}>Retry</Button>
      </BlockingScreen>
    );
  }

  if (status && !status.gitInstalled) {
    return (
      <BlockingScreen title="Install Git">
        <Text c="dimmed">
          CAN ingest and spec sync need a local Git install. Install Git, then retry.
        </Text>
        <Anchor href={GIT_URL} target="_blank" rel="noreferrer">
          Download Git
        </Anchor>
        <Button onClick={load}>Retry</Button>
      </BlockingScreen>
    );
  }

  if (status && (!status.cloned || !status.canRootExists)) {
    return (
      <BlockingScreen title="Set up data">
        <Text c="dimmed">
          Clone the Embedded-Sharepoint <code>can/</code> tree into your local data folder, or
          repair a broken checkout.
        </Text>
        <TextInput
          label="Remote URL"
          value={remoteUrl}
          onChange={(e) => setRemoteUrl(e.currentTarget.value)}
        />
        <TextInput
          label="Branch"
          value={branch}
          onChange={(e) => setBranch(e.currentTarget.value)}
        />
        {error ? (
          <Text size="sm" c="red" style={{ whiteSpace: 'pre-wrap' }}>
            {error}
          </Text>
        ) : null}
        <Button onClick={() => runClone(false)} loading={busy}>
          Clone
        </Button>
        <Button variant="default" onClick={() => runClone(true)} loading={busy}>
          Repair (re-clone)
        </Button>
        <Button variant="subtle" onClick={load} disabled={busy}>
          Refresh status
        </Button>
      </BlockingScreen>
    );
  }

  return children;
}
