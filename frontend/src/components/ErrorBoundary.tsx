import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
          <div className="max-w-md rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h1 className="mb-2 text-lg font-semibold text-slate-900">Something went wrong</h1>
            <p className="mb-6 text-sm text-slate-500">
              An unexpected error occurred. Reloading usually fixes it — if it keeps happening, let us know.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="rounded bg-slate-900 px-4 py-2 text-sm text-white"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
