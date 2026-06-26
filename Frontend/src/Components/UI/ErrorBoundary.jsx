import React, { Component } from "react";
import { AlertOctagon, RotateCcw, Home } from "lucide-react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="page-wrapper with-navbar"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "calc(100vh - 120px)",
            padding: "24px",
          }}
        >
          <div
            className="card-elevated"
            style={{
              maxWidth: "500px",
              width: "100%",
              padding: "40px 32px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "24px",
            }}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                background: "var(--md-error-container, #ffdede)",
                color: "var(--md-on-error-container, #ba1a1a)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AlertOctagon size={32} />
            </div>

            <div>
              <h1 className="text-headline-medium serif-heading" style={{ margin: "0 0 8px 0", color: "var(--md-on-surface)" }}>
                Something went wrong
              </h1>
              <p className="text-body-medium" style={{ margin: 0, color: "var(--md-on-surface-variant)" }}>
                An unexpected error occurred while rendering this page.
              </p>
            </div>

            {this.state.error && import.meta.env.DEV && (
              <pre
                style={{
                  width: "100%",
                  padding: "16px",
                  background: "var(--md-surface-container-high, #f5f5f5)",
                  color: "var(--md-error, #ba1a1a)",
                  borderRadius: "12px",
                  fontSize: "0.75rem",
                  fontFamily: "monospace",
                  overflowX: "auto",
                  textAlign: "left",
                  margin: 0,
                  border: "1px solid var(--md-outline-variant, #ccc)",
                }}
              >
                {this.state.error.toString()}
              </pre>
            )}

            <div style={{ display: "flex", gap: "12px", width: "100%", justifyContent: "center" }}>
              <button
                onClick={this.handleReset}
                className="btn-filled"
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <RotateCcw size={16} />
                Try Reloading
              </button>
              <a
                href="/"
                className="btn-outlined"
                style={{ display: "inline-flex", alignItems: "center", gap: "8px", textDecoration: "none" }}
              >
                <Home size={16} />
                Go Home
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
