import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import "./styles/index.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("アプリケーションの表示先が見つかりません。");
}

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
