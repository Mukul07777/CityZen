"use client";

import React from "react";
import { logError } from "../lib/logError";

// Catches render-time errors in whatever page/section it wraps and shows
// an actual message instead of a blank screen. This does NOT catch async
// errors from supabase calls inside useEffect/event handlers (React error
// boundaries can't) — those need their own try/catch + inline error state,
// which is handled per-page. This boundary is for the "component threw
// while rendering" case, which previously meant a blank white page with
// no indication anything went wrong.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    logError(this.props.context || "ErrorBoundary", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[40vh] flex flex-col items-center justify-center text-center p-8 bg-cream">
          <p className="text-lg font-semibold text-navy mb-2">Something went wrong.</p>
          <p className="text-sm text-navy/60 mb-4">
            This has been logged. Try reloading the page — if it keeps happening, let us know.
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="px-5 py-2 rounded-lg bg-navy text-cream font-semibold hover:bg-navy-light transition"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
