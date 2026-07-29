import {
  Clock3Icon,
  FastForwardIcon,
  PauseIcon,
  PlayIcon,
  RewindIcon,
  RotateCcwIcon,
} from "lucide-react";
import {
  isPlaybackSpeed,
  PLAYBACK_SPEEDS,
  type PlaybackDirection,
  type PlaybackSpeed,
} from "./playbackClock";

type TimeControlsProps = {
  dateTimeMaximum: string;
  dateTimeMinimum: string;
  dateTimeInputValue: string;
  direction: PlaybackDirection;
  hasError: boolean;
  isPlaying: boolean;
  motionRestricted: boolean;
  onDateTimeChange: (value: string) => void;
  onDirectionChange: (direction: PlaybackDirection) => void;
  onNow: () => void;
  onPlaybackToggle: () => void;
  onPlaybackSpeedChange: (speed: PlaybackSpeed) => void;
  onResetView: () => void;
  onShiftHours: (hours: number) => void;
  playbackDateTime: string;
  playbackSpeed: PlaybackSpeed;
  playbackTimeText: string;
  timeZone: string;
};

export function TimeControls({
  dateTimeMaximum,
  dateTimeMinimum,
  dateTimeInputValue,
  direction,
  hasError,
  isPlaying,
  motionRestricted,
  onDateTimeChange,
  onDirectionChange,
  onNow,
  onPlaybackSpeedChange,
  onPlaybackToggle,
  onResetView,
  onShiftHours,
  playbackDateTime,
  playbackSpeed,
  playbackTimeText,
  timeZone,
}: TimeControlsProps) {
  const speed =
    PLAYBACK_SPEEDS.find(
      (candidate) =>
        candidate.secondsPerSecond === playbackSpeed,
    ) ?? PLAYBACK_SPEEDS[3];
  const playbackDescription = motionRestricted
    ? "動きを減らす設定が有効です。前後1時間の操作を利用できます。"
    : `${direction < 0 ? "逆方向" : "順方向"}・${speed.label}${
        isPlaying ? "で再生中" : "で停止中"
      }`;

  return (
    <section aria-label="観測時刻" className="time-controls">
      <div className="playback-controls">
        <button
          aria-label={isPlaying ? "時間を一時停止" : "時間を再生"}
          aria-pressed={isPlaying}
          className="playback-toggle"
          disabled={motionRestricted}
          onClick={onPlaybackToggle}
          type="button"
        >
          {isPlaying ? (
            <PauseIcon aria-hidden="true" size={18} strokeWidth={1.8} />
          ) : (
            <PlayIcon aria-hidden="true" size={18} strokeWidth={1.8} />
          )}
          <span>{isPlaying ? "一時停止" : "再生"}</span>
        </button>

        <div
          aria-label="時間の進む方向"
          className="playback-direction"
          role="group"
        >
          <button
            aria-pressed={direction === -1}
            disabled={motionRestricted}
            onClick={() => onDirectionChange(-1)}
            type="button"
          >
            <RewindIcon aria-hidden="true" size={17} strokeWidth={1.8} />
            <span>逆方向</span>
          </button>
          <button
            aria-pressed={direction === 1}
            disabled={motionRestricted}
            onClick={() => onDirectionChange(1)}
            type="button"
          >
            <FastForwardIcon
              aria-hidden="true"
              size={17}
              strokeWidth={1.8}
            />
            <span>順方向</span>
          </button>
        </div>

        <label className="playback-speed">
          <span>速度</span>
          <select
            aria-label="再生速度"
            disabled={motionRestricted}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (isPlaybackSpeed(value)) {
                onPlaybackSpeedChange(value);
              }
            }}
            value={playbackSpeed}
          >
            {PLAYBACK_SPEEDS.map((option) => (
              <option
                key={option.secondsPerSecond}
                value={option.secondsPerSecond}
              >
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="playback-readout">
          <time dateTime={playbackDateTime}>{playbackTimeText}</time>
          <span aria-live="polite" className="playback-status">
            {playbackDescription}
          </span>
        </div>
      </div>

      <label className="datetime-control">
        <Clock3Icon aria-hidden="true" size={19} strokeWidth={1.8} />
        <span className="sr-only">観測日時（{timeZone}）</span>
        <input
          aria-describedby={`time-zone-description time-range-description${
            hasError ? " observation-time-error" : ""
          }`}
          aria-invalid={hasError}
          max={dateTimeMaximum}
          min={dateTimeMinimum}
          onChange={(event) => onDateTimeChange(event.target.value)}
          type="datetime-local"
          value={dateTimeInputValue}
        />
      </label>
      <span className="sr-only" id="time-zone-description">
        タイムゾーンは{timeZone}です
      </span>
      <div className="time-controls__stepper">
        <button onClick={() => onShiftHours(-1)} type="button">
          −1時間
        </button>
        <button onClick={onNow} type="button">
          いま
        </button>
        <button onClick={() => onShiftHours(1)} type="button">
          ＋1時間
        </button>
      </div>
      <button
        className="reset-view-button"
        onClick={onResetView}
        type="button"
      >
        <RotateCcwIcon aria-hidden="true" size={18} strokeWidth={1.8} />
        表示をリセット
      </button>
      <p className="time-range-note" id="time-range-description">
        対応期間：1900年1月1日〜2100年12月31日（UTC）
      </p>
    </section>
  );
}
