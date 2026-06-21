// Live validation summary + clickable issue list. Clicking an issue selects the
// offending entity in the tree (deep-link via the issue's `sel`).

export default function ValidationPanel({ issues, summary, onSelectIssue }) {
  return (
    <div className="mdc-card">
      <h2>Validation</h2>
      <div className="mdc-status" style={{ marginBottom: 10 }}>
        <span className={`mdc-status-dot ${summary.valid ? (summary.warnings ? 'warn' : 'ok') : 'err'}`} />
        {summary.valid ? 'Schema-valid' : `${summary.errors} error${summary.errors === 1 ? '' : 's'}`}
        {summary.warnings > 0 && <span className="mdc-muted"> · {summary.warnings} warning{summary.warnings === 1 ? '' : 's'}</span>}
      </div>
      {issues.length > 0 && (
        <div className="mdc-issues">
          {issues.map((issue, i) => (
            <div key={i} className="mdc-issue" onClick={() => issue.sel && onSelectIssue(issue.sel)}>
              <span className={`mdc-issue-sev ${issue.severity}`}>{issue.severity}</span>
              <span>
                <span className="mdc-issue-path">{issue.path}</span>{' '}
                <span className="mdc-issue-msg">{issue.message}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
