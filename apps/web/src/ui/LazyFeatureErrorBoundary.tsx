import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from "react";

type LazyFeatureErrorBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
  featureName: string;
};

type LazyFeatureErrorBoundaryState = {
  failed: boolean;
};

export class LazyFeatureErrorBoundary extends Component<
  LazyFeatureErrorBoundaryProps,
  LazyFeatureErrorBoundaryState
> {
  state: LazyFeatureErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): LazyFeatureErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `${this.props.featureName} failed to load`,
      error,
      info.componentStack,
    );
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
