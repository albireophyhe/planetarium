import { useCallback, useEffect, useState } from "react";
import {
  loadPrecisionStarCatalogV2,
  type PrecisionStarCatalogV2,
} from "../domain";

type PrecisionCatalogState =
  | {
      catalog: null;
      status: "loading";
    }
  | {
      catalog: PrecisionStarCatalogV2;
      status: "ready";
    }
  | {
      catalog: null;
      status: "error";
    };

export function usePrecisionCatalog() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PrecisionCatalogState>({
    catalog: null,
    status: "loading",
  });

  useEffect(() => {
    let active = true;

    void loadPrecisionStarCatalogV2()
      .then((catalog) => {
        if (active) {
          setState({ catalog, status: "ready" });
        }
      })
      .catch(() => {
        if (active) {
          setState({ catalog: null, status: "error" });
        }
      });

    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ catalog: null, status: "loading" });
    setAttempt((current) => current + 1);
  }, []);

  return {
    ...state,
    retry,
  };
}
