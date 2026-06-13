import { Component } from "react";

// React error boundaries can only be class components (no hook equivalent),
// so this is the one class in the app. A render crash anywhere below shows a
// recoverable message instead of a white screen. Recovery is a full page
// load (reload or back to the dashboard), which resets all React state.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="container">
          <div className="card" role="alert">
            <h2>Something went wrong</h2>
            <p className="muted">
              This page hit an unexpected error. Your data is safe — reload the
              page or head back to the dashboard.
            </p>
            <div className="actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => window.location.reload()}
              >
                Reload
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => window.location.assign("/")}
              >
                Back to dashboard
              </button>
            </div>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
