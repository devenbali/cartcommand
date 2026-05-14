import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface State { hasError: boolean; message: string }

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'An unexpected error occurred.',
    };
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center p-8"
           style={{ background: '#0d1117' }}>
        <div className="max-w-md w-full rounded-2xl p-8 text-center"
             style={{ background: '#161b27', border: '1px solid rgba(248,81,73,0.2)' }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
               style={{ background: 'rgba(248,81,73,0.1)', color: '#f85149' }}>
            <AlertTriangle size={24} />
          </div>
          <h2 className="text-lg font-bold mb-2" style={{ color: '#e6edf3' }}>
            Something went wrong
          </h2>
          <p className="text-sm mb-6" style={{ color: '#7d8590' }}>
            {this.state.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: '#22c55e', color: '#0d1117' }}
          >
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
