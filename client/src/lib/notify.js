import { toast } from "sonner";

function pickVariant(color) {
  if (!color) return "message";
  const c = String(color).toLowerCase();
  if (["red", "pink", "crimson", "rose"].some((k) => c.includes(k))) return "error";
  if (["green", "teal", "lime", "emerald"].some((k) => c.includes(k))) return "success";
  if (["yellow", "orange", "amber"].some((k) => c.includes(k))) return "warning";
  if (["blue", "cyan", "indigo", "sky"].some((k) => c.includes(k))) return "info";
  return "message";
}

/**
 * Drop-in shim for @mantine/notifications `notifications` API, backed by sonner.
 * Supports the `.show({ title, message, color })` shape used across the app.
 */
export const notifications = {
  show({ title, message, color, id, ...opts } = {}) {
    const variant = pickVariant(color);
    const heading = title ?? message ?? "";
    const description = title ? message : undefined;
    const fn = variant === "message" ? toast : toast[variant];
    return fn(heading, { id, description, ...opts });
  },
  clean() {
    toast.dismiss();
  },
  hide(id) {
    toast.dismiss(id);
  },
};

export { toast };
