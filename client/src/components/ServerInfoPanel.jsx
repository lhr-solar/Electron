import { useTelemetryStatus } from './StatusBar';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

function Row({ label, value, mono = false }) {
  const display = value == null || value === '' ? '—' : String(value);
  return (
    <div className="grid grid-cols-[110px_1fr] items-baseline gap-x-3 gap-y-0.5 border-b border-border/60 py-2 last:border-b-0">
      <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      <span
        className={cn('min-w-0 break-words text-[13px] font-medium text-foreground', mono && 'tabular')}
        title={display !== '—' ? display : undefined}
      >
        {display}
      </span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="rounded-lg border border-border bg-card/40 px-3.5 py-3">
      <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {title}
      </h3>
      <div>{children}</div>
    </section>
  );
}

function ToneBadge({ ok, yes = 'on', no = 'off' }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        ok
          ? 'border-signal-green/30 bg-signal-green/10 text-signal-green'
          : 'border-border bg-muted/40 text-muted-foreground'
      )}
    >
      {ok ? yes : no}
    </Badge>
  );
}

function adapterDetailLabel(mode) {
  switch (mode) {
    case 'serial_canadapter':
    case 'serial_uart':
      return 'Port';
    case 'pcan':
      return 'PCAN';
    case 'tcp':
      return 'TCP';
    case 'canp_tcp':
      return 'CANP';
    case 'file':
      return 'File';
    default:
      return 'Endpoint';
  }
}

export function ServerInfoPanel() {
  const { backendConnected, status, adapter } = useTelemetryStatus();
  const run = status.current_run;
  const dbcFiles = Array.isArray(status.dbc_files) ? status.dbc_files : [];
  const dbcErrors = Array.isArray(status.dbc_errors) ? status.dbc_errors : [];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight">Session info</h2>
          <p className="text-xs text-muted-foreground">Read-only connection and run status</p>
        </div>
        <ToneBadge ok={backendConnected} yes="linked" no="offline" />
      </div>

      <Section title="Service">
        <Row label="State" value={status.service_running ? 'running' : 'stopped'} />
        <Row label="Vehicle" value={status.vehicle} />
        <Row
          label="DBC files"
          value={dbcFiles.length ? `${dbcFiles.length}: ${dbcFiles.join(', ')}` : '—'}
        />
        <Row label="Parser" value={status.parser_status} />
        <Row
          label="Adapter link"
          value={
            !status.service_running
              ? 'offline'
              : status.parser_connection_state === true
                ? 'connected'
                : status.parser_connection_state === false
                  ? 'disconnected'
                  : adapter.label
          }
        />
        {status.error_message ? <Row label="Error" value={status.error_message} /> : null}
      </Section>

      <Section title="Connection">
        <Row label="Adapter" value={status.adapter?.label || adapter.label} />
        <Row
          label={adapterDetailLabel(status.adapter?.mode)}
          value={status.adapter?.detail}
          mono
        />
        <Row label="Mode" value={status.adapter?.mode} mono />
      </Section>

      <Section title="Database">
        <div className="grid grid-cols-[110px_1fr] items-center gap-x-3 border-b border-border/60 py-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Influx
          </span>
          <ToneBadge ok={status.influx_connected} yes="connected" no="disconnected" />
        </div>
        <div className="grid grid-cols-[110px_1fr] items-center gap-x-3 border-b border-border/60 py-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Writes
          </span>
          <ToneBadge
            ok={status.influx_write_enabled}
            yes="enabled"
            no={status.influx_write_configured === false ? 'disabled' : 'not writing'}
          />
        </div>
        <Row label="Bucket" value={status.influx_bucket} mono />
        <div className="grid grid-cols-[110px_1fr] items-center gap-x-3 py-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Grafana
          </span>
          <ToneBadge ok={status.grafana_active} yes="up" no="down" />
        </div>
      </Section>

      <Section title="Current run">
        {run ? (
          <>
            <Row label="Name" value={run.display_name} />
            <Row label="Run #" value={run.run_number} mono />
            <Row label="Started" value={run.start_time_iso} mono />
            <Row label="Capture" value={run.dump_file} mono />
            <Row label="Event bucket" value={run.bucket_name} mono />
          </>
        ) : (
          <p className="py-2 text-sm text-muted-foreground">
            {status.service_running ? 'Waiting for first packets…' : 'No active run.'}
          </p>
        )}
      </Section>

      {dbcErrors.length > 0 && (
        <Section title="DBC warnings">
          <ul className="space-y-1.5 py-1 text-xs text-muted-foreground">
            {dbcErrors.map((err) => (
              <li key={err} className="break-words">
                {err}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
