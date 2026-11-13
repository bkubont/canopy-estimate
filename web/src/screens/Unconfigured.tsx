export function Unconfigured() {
  return (
    <div className="center-page">
      <div className="card center-card">
        <h2>Almost there</h2>
        <p>This copy of the app isn’t connected to a database yet.</p>
        <p className="muted small">
          Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>web/.env</code> and rebuild. See
          SETUP.md.
        </p>
      </div>
    </div>
  );
}
