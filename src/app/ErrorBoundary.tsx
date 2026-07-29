import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Application render error', error, errorInfo);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <main className="fatal-error" role="alert">
        <p className="eyebrow">Application error</p>
        <h1>The pose workspace could not continue.</h1>
        <p>{this.state.error.message}</p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload application
        </button>
      </main>
    );
  }
}
