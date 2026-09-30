import { Component } from 'react';

export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="panel max-w-md p-6">
          <h1 className="text-[16px] font-semibold">This screen crashed</h1>
          <p className="mt-2 text-muted text-[13px] leading-relaxed">
            The incident data is safe on the server. Reload to reconnect. If it keeps happening, the message below helps us find it.
          </p>
          <pre className="mt-3 p-2 bg-sunken rounded text-[12px] font-mono whitespace-pre-wrap">{String(this.state.error.message)}</pre>
          <button type="button" onClick={() => window.location.reload()} className="mt-4 h-9 px-3.5 rounded-card bg-accent text-on-accent font-medium cursor-pointer">
            Reload
          </button>
        </div>
      </div>
    );
  }
}
