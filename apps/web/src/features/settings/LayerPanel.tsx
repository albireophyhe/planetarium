import { RotateCcwIcon } from "lucide-react";
import type { LayerSettings } from "../../app/types";
import { Switch } from "../../ui/Switch";

type LayerPanelProps = {
  layers: LayerSettings;
  onChange: (key: keyof LayerSettings, checked: boolean) => void;
  onResetView: () => void;
};

export function LayerPanel({
  layers,
  onChange,
  onResetView,
}: LayerPanelProps) {
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
        label="標準大気差（高度5°以上）"
        onChange={(checked) =>
          onChange("atmosphericRefraction", checked)
        }
      />
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
