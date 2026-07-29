import { SearchIcon, StarIcon, XIcon } from "lucide-react";
import {
  type KeyboardEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
} from "react";
import type { StarViewModel } from "../../app/types";
import {
  formatDecimal,
  formatSignedDegrees,
} from "../../app/astronomicalFormatting";
import { SegmentedControl } from "../../ui/SegmentedControl";

type StarExplorerProps = {
  allStars: readonly StarViewModel[];
  onSearchFocusRequest?: () => void;
  onSelect: (hr: number) => void;
  onQueryChange: (value: string) => void;
  onVisibleModeChange: (value: "above" | "all") => void;
  query: string;
  selectedHr: number | null;
  visibleMode: "above" | "all";
};

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase("ja-JP");
}

function matchesQuery(star: StarViewModel, query: string) {
  if (!query) {
    return true;
  }
  return [
    star.japaneseName,
    star.englishName,
    star.catalogName ?? "",
    star.constellation,
    ...star.aliases,
  ].some((value) => normalizeSearch(value).includes(query));
}

function formatAltitude(value: number) {
  return formatSignedDegrees(value, 0);
}

export function StarExplorer({
  allStars,
  onQueryChange,
  onSearchFocusRequest,
  onSelect,
  onVisibleModeChange,
  query,
  selectedHr,
  visibleMode,
}: StarExplorerProps) {
  const deferredQuery = useDeferredValue(query);
  const optionRefs = useRef(new Map<number, HTMLButtonElement>());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const queryMatchedStars = useMemo(() => {
    const normalizedQuery = normalizeSearch(deferredQuery);

    return [...allStars]
      .filter((star) => matchesQuery(star, normalizedQuery));
  }, [allStars, deferredQuery]);
  const filteredStars = useMemo(() => {
    return queryMatchedStars
      .filter((star) => visibleMode === "all" || star.altitudeDeg >= 0)
      .sort((a, b) => {
        if (visibleMode === "above") {
          return b.altitudeDeg - a.altitudeDeg;
        }
        return a.vMagnitude - b.vMagnitude;
      });
  }, [queryMatchedStars, visibleMode]);
  const hiddenMatches =
    visibleMode === "above" && normalizeSearch(deferredQuery)
      ? queryMatchedStars.filter((star) => star.altitudeDeg < 0)
      : [];
  const selectedStar =
    selectedHr === null
      ? undefined
      : allStars.find((star) => star.hr === selectedHr);
  const selectedIndex = filteredStars.findIndex(
    (star) => star.hr === selectedHr,
  );
  const selectedMatchesQuery =
    selectedStar === undefined
      ? false
      : matchesQuery(
          selectedStar,
          normalizeSearch(deferredQuery),
        );
  const selectedBelowVisibleRange =
    selectedStar !== undefined &&
    visibleMode === "above" &&
    selectedStar.altitudeDeg < 0;
  const selectedOutsideList =
    selectedStar !== undefined && selectedIndex === -1;
  const revealSelectionRef = useRef(false);

  useEffect(() => {
    if (
      !revealSelectionRef.current ||
      selectedHr === null ||
      selectedIndex < 0
    ) {
      return;
    }

    revealSelectionRef.current = false;
    const selectedOption = optionRefs.current.get(selectedHr);
    selectedOption?.focus();
    selectedOption?.scrollIntoView?.({ block: "nearest" });
  }, [selectedHr, selectedIndex]);

  useEffect(() => {
    function handleSearchShortcut(event: globalThis.KeyboardEvent) {
      const target =
        event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("dialog[open]")) {
        return;
      }
      const isEditable =
        target?.matches("input, textarea, select") ||
        target?.isContentEditable;
      const isCommandK =
        event.key.toLocaleLowerCase("en-US") === "k" &&
        (event.metaKey || event.ctrlKey);
      const isSlash =
        event.key === "/" &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        !isEditable;

      if (!isCommandK && !isSlash) {
        return;
      }
      event.preventDefault();
      onSearchFocusRequest?.();
      queueMicrotask(() => searchInputRef.current?.focus());
    }

    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, [onSearchFocusRequest]);

  function handleOptionKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) {
    let nextIndex: number;
    switch (event.key) {
      case "ArrowDown":
        nextIndex = Math.min(currentIndex + 1, filteredStars.length - 1);
        break;
      case "ArrowUp":
        nextIndex = Math.max(currentIndex - 1, 0);
        break;
      case "End":
        nextIndex = filteredStars.length - 1;
        break;
      case "Home":
        nextIndex = 0;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextStar = filteredStars[nextIndex];
    if (!nextStar) {
      return;
    }
    onSelect(nextStar.hr);
    const nextOption = optionRefs.current.get(nextStar.hr);
    nextOption?.focus();
    nextOption?.scrollIntoView?.({ block: "nearest" });
  }

  return (
    <section aria-labelledby="star-explorer-title" className="star-explorer">
      <h2 className="sr-only" id="star-explorer-title">
        星を探す
      </h2>
      <div className="search-field">
        <SearchIcon aria-hidden="true" size={22} strokeWidth={1.8} />
        <input
          aria-keyshortcuts="/ Meta+K Control+K"
          aria-label="星を検索"
          autoComplete="off"
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query) {
              event.preventDefault();
              onQueryChange("");
            }
          }}
          placeholder="星を検索"
          ref={searchInputRef}
          type="search"
          value={query}
        />
        {query ? (
          <button
            aria-label="検索をクリア"
            className="search-field__clear"
            onClick={() => {
              onQueryChange("");
              searchInputRef.current?.focus();
            }}
            type="button"
          >
            <XIcon aria-hidden="true" size={18} strokeWidth={2} />
          </button>
        ) : (
          <kbd aria-hidden="true" className="search-field__shortcut">
            /
          </kbd>
        )}
      </div>

      <SegmentedControl
        ariaLabel="星の表示範囲"
        onChange={onVisibleModeChange}
        options={[
          { label: "地平線上", value: "above" },
          { label: "すべて", value: "all" },
        ]}
        value={visibleMode}
      />

      {selectedOutsideList && selectedStar ? (
        <div className="selected-star-tracking">
          <div
            aria-label="選択星の追跡状態"
            className="selected-star-tracking__copy"
            role="status"
          >
            <strong>選択中：{selectedStar.japaneseName}</strong>
            <span>
              {!selectedMatchesQuery && selectedBelowVisibleRange
                ? "検索条件の外にあり、現在は地平線下です。追跡は継続しています。"
                : !selectedMatchesQuery
                  ? "現在の検索条件の外です。追跡は継続しています。"
                  : selectedBelowVisibleRange
                    ? "現在は地平線下です。追跡は継続しています。"
                    : "現在の一覧には表示されていません。追跡は継続しています。"}
            </span>
          </div>
          <button
            aria-label={`${selectedStar.japaneseName}を一覧に表示`}
            className="selected-star-tracking__action"
            onClick={() => {
              revealSelectionRef.current = true;
              if (!selectedMatchesQuery) {
                onQueryChange("");
              }
              if (selectedBelowVisibleRange) {
                onVisibleModeChange("all");
              }
            }}
            type="button"
          >
            一覧に表示
          </button>
        </div>
      ) : null}

      <div aria-live="polite" className="star-results-summary sr-only">
        {filteredStars.length}個の名前付き恒星
      </div>
      <div className="star-list" role="listbox" aria-label="名前付き恒星">
        {filteredStars.length > 0 ? (
          filteredStars.map((star, index) => {
            const isSelected = star.hr === selectedHr;
            return (
              <button
                aria-label={`${star.japaneseName}、等級${formatDecimal(star.vMagnitude, 2)}、高度${formatAltitude(star.altitudeDeg)}`}
                aria-posinset={index + 1}
                aria-selected={isSelected}
                aria-setsize={filteredStars.length}
                className="star-row"
                key={star.hr}
                onClick={() => onSelect(star.hr)}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
                ref={(node) => {
                  if (node) {
                    optionRefs.current.set(star.hr, node);
                  } else {
                    optionRefs.current.delete(star.hr);
                  }
                }}
                role="option"
                tabIndex={
                  isSelected || (selectedIndex === -1 && index === 0) ? 0 : -1
                }
                type="button"
              >
                <StarIcon
                  aria-hidden="true"
                  className="star-row__icon"
                  fill={isSelected ? "currentColor" : "none"}
                  size={18}
                  strokeWidth={1.7}
                />
                <span className="star-row__name">{star.japaneseName}</span>
                <span className="star-row__magnitude">
                  {formatDecimal(star.vMagnitude, 2)}
                </span>
                <span className="star-row__altitude">
                  {formatAltitude(star.altitudeDeg)}
                </span>
                <span aria-hidden="true" className="star-row__chevron">
                  ›
                </span>
              </button>
            );
          })
        ) : hiddenMatches.length > 0 ? (
          <div className="empty-state">
            <p>一致する星は現在すべて地平線下です。</p>
            <button
              className="empty-state__action"
              onClick={() => {
                onVisibleModeChange("all");
                const firstMatch = hiddenMatches[0];
                if (firstMatch) {
                  onSelect(firstMatch.hr);
                }
              }}
              type="button"
            >
              {hiddenMatches.length}個を「すべて」で見る
            </button>
          </div>
        ) : (
          <p className="empty-state">
            条件に合う星がありません。検索語または表示範囲を変更してください。
          </p>
        )}
      </div>
    </section>
  );
}
