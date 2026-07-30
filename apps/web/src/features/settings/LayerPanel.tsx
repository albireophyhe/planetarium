import { RotateCcwIcon } from "lucide-react";
import type { Ref } from "react";
import type {
  AppliedRefraction,
  LayerSettings,
} from "../../app/types";
import {
  atmosphereSourceLabel,
  atmosphereValueSummary,
} from "../../app/standardAtmosphere";
import { Switch } from "../../ui/Switch";

type LayerPanelProps = {
  appliedRefraction: AppliedRefraction | null;
  atmosphereTriggerRef?: Ref<HTMLButtonElement>;
  layers: LayerSettings;
  onAtmosphereOpen: () => void;
  onChange: (key: keyof LayerSettings, checked: boolean) => void;
  onResetView: () => void;
};

export function LayerPanel({
  appliedRefraction,
  atmosphereTriggerRef,
  layers,
  onAtmosphereOpen,
  onChange,
  onResetView,
}: LayerPanelProps) {
  const refractionLabel =
    appliedRefraction?.inputSource === "manual"
      ? "大気差（手動設定）"
      : "標準大気差（高度5°以上）";

  return (
    <section aria-labelledby="layer-panel-title" className="layer-panel">
      <h2 className="sr-only" id="layer-panel-title">
        表示設定
      </h2>
      <Switch
        checked={layers.constellationLines}
        label="星座線"
        onChange={(checked) => onChange("constellationLines", checked)}
      />
      <Switch
        checked={layers.starLabels}
        label="星の名前"
        onChange={(checked) => onChange("starLabels", checked)}
      />
      <Switch
        checked={layers.selectedStarTrack}
        label="選択星の軌跡"
        onChange={(checked) => onChange("selectedStarTrack", checked)}
      />
      <Switch
        checked={layers.nightMode}
        label="ナイトモード"
        onChange={(checked) => onChange("nightMode", checked)}
      />
      <Switch
        checked={layers.atmosphericRefraction}
        label={refractionLabel}
        onChange={(checked) =>
          onChange("atmosphericRefraction", checked)
        }
      />
      <div className="atmosphere-settings">
        <div
          aria-live="polite"
          className="atmosphere-settings__status"
        >
          <strong>
            {appliedRefraction
              ? `${atmosphereSourceLabel(
                  appliedRefraction.inputSource,
                )}を適用中`
              : "大気差はオフ"}
          </strong>
          <span>
            {appliedRefraction
              ? atmosphereValueSummary(
                  appliedRefraction.atmosphere,
                )
              : "観測高度は真空中の幾何高度です。"}
          </span>
        </div>
        <button
          className="atmosphere-settings__button"
          onClick={onAtmosphereOpen}
          ref={atmosphereTriggerRef}
          type="button"
        >
          大気設定を開く
        </button>
      </div>
      <button
        className="settings-reset-button"
        onClick={onResetView}
        type="button"
      >
        <RotateCcwIcon aria-hidden="true" size={18} strokeWidth={1.8} />
        表示をリセット
      </button>
    </section>
  );
}
