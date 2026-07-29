import { Component, type ErrorInfo, type ReactNode } from "react";
import { CircleAlertIcon } from "lucide-react";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Planetarium UI error", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="fatal-error">
          <div>
            <div className="fatal-error__mark" aria-hidden="true">
              <CircleAlertIcon size={42} strokeWidth={1.5} />
            </div>
            <h1>星図を表示できませんでした</h1>
            <p>
              読み込み中に問題が起きました。再読み込みしても直らない場合は、ブラウザを更新してください。
            </p>
            <button
              className="button button--primary"
              onClick={() => window.location.reload()}
              type="button"
            >
              再読み込み
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
