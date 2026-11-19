import { Component } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default class PortalErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || "An unexpected rendering error occurred.",
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[PortalErrorBoundary] Render error caught:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: "" });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto my-8 max-w-xl rounded-3xl border border-rose-500/30 bg-[var(--bg-surface)] p-6 text-center shadow-2xs">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/12 text-rose-600 dark:text-rose-300">
            <AlertTriangle size={22} />
          </div>
          <h2 className="mt-4 text-lg font-extrabold text-[var(--text-primary)]">
            {this.props.title || "Unable to display this page"}
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
            {this.state.errorMessage || "Something went wrong while rendering this view."}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#141A17] px-5 py-2.5 text-xs font-bold text-[#BEF264] shadow-xs transition hover:bg-[#1E6B4B] hover:text-white dark:bg-[#A3E635] dark:text-[#090D0B] dark:hover:bg-[#22C55E] cursor-pointer"
            >
              <RefreshCw size={14} /> Try Again
            </button>
            {this.props.fallbackAction}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
