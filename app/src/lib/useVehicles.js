import { useCallback, useEffect, useMemo, useState } from 'react';
import { useEngineClient } from './useEngine.jsx';

/** Resolve defaultVehicle against the list; fall back to first entry. */
export function resolveDefaultVehicle(vehicles, defaultVehicle) {
  const ids = vehicles.map((v) => v.id);
  if (!ids.length) return null;
  if (defaultVehicle && ids.includes(defaultVehicle)) return defaultVehicle;
  return ids[0];
}

export function useVehicles() {
  const client = useEngineClient();
  const [vehicles, setVehicles] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [v, s] = await Promise.all([client.getVehicles(), client.getSettings()]);
      setVehicles(v);
      setSettings(s);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const resolvedDefault = useMemo(
    () => resolveDefaultVehicle(vehicles, settings?.defaultVehicle),
    [vehicles, settings?.defaultVehicle],
  );

  const setDefaultVehicle = useCallback(
    async (id) => {
      const next = await client.updateSettings({ defaultVehicle: id });
      setSettings(next);
      return next;
    },
    [client],
  );

  const addVehicle = useCallback(
    async (name) => {
      const entry = await client.addVehicle(name);
      await refresh();
      return entry;
    },
    [client, refresh],
  );

  return {
    vehicles,
    settings,
    resolvedDefault,
    loading,
    error,
    refresh,
    setDefaultVehicle,
    addVehicle,
  };
}
