import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner } from "sonner";

const Toaster = ({
  ...props
}) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      position="bottom-left"
      duration={2200}
      closeButton
      icons={{
        success: <CircleCheckIcon className="size-4 text-signal-green" />,
        info: <InfoIcon className="size-4 text-signal-blue" />,
        warning: <TriangleAlertIcon className="size-4 text-signal-amber" />,
        error: <OctagonXIcon className="size-4 text-signal-red" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)"
        }
      }
      {...props} />
  );
}

export { Toaster }
