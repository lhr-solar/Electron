import { useCallback, useState } from "react";

/** Drop-in shim for @mantine/hooks `useDisclosure`. */
export function useDisclosure(initialState = false, handlers = {}) {
  const [opened, setOpened] = useState(initialState);
  const { onOpen, onClose } = handlers;

  const open = useCallback(() => {
    setOpened((isOpened) => {
      if (!isOpened) onOpen?.();
      return true;
    });
  }, [onOpen]);

  const close = useCallback(() => {
    setOpened((isOpened) => {
      if (isOpened) onClose?.();
      return false;
    });
  }, [onClose]);

  const toggle = useCallback(() => {
    setOpened((isOpened) => {
      if (isOpened) onClose?.();
      else onOpen?.();
      return !isOpened;
    });
  }, [onOpen, onClose]);

  return [opened, { open, close, toggle }];
}

/** Drop-in shim for @mantine/hooks `useLocalStorage` (JSON serialized). */
export function useLocalStorage({ key, defaultValue }) {
  const [value, setValue] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setStored = useCallback(
    (val) => {
      setValue((prev) => {
        const next = typeof val === "function" ? val(prev) : val;
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* ignore quota / access errors */
        }
        return next;
      });
    },
    [key]
  );

  const remove = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    setValue(defaultValue);
  }, [key, defaultValue]);

  return [value, setStored, remove];
}
