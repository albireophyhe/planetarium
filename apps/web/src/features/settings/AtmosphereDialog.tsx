import { type ClipboardEvent, useState } from "react";
import type { AppliedRefraction } from "../../app/types";
import {
  atmosphereSourceLabel,
  atmosphereValueSummary,
  STANDARD_APPLIED_REFRACTION,
  STANDARD_VISUAL_ATMOSPHERE,
} from "../../app/standardAtmosphere";
import {
  applyVisualRefractionWithCoefficients,
  refractionCoefficients,
  type Atmosphere,
} from "../../domain";
import { Dialog } from "../../ui/Dialog";

type AtmosphereDialogProps = {
  current: AppliedRefraction | null;
  manualDraftAtmosphere?: Atmosphere | null;
  onApply: (refraction: AppliedRefraction) => void;
  onClose: () => void;
  open: boolean;
};

type AtmosphereDraft = {
  minimumGeometricAltitudeDegrees: string;
  pressureHpa: string;
  relativeHumidityPercent: string;
  temperatureCelsius: string;
  wavelengthMicrometers: string;
};

type AtmosphereField = keyof AtmosphereDraft;

function editableNumber(value: number) {
  return String(Number(value.toFixed(12)));
}

type AtmosphereFieldErrors = Partial<
  Record<AtmosphereField, string>
>;

type AtmosphereDraftValidation =
  | {
      atmosphere: Atmosphere;
      errors: AtmosphereFieldErrors;
      ok: true;
      summary: null;
    }
  | {
      atmosphere: null;
      errors: AtmosphereFieldErrors;
      ok: false;
      summary: string;
    };

const FIELD_LABELS: Record<AtmosphereField, string> = {
  minimumGeometricAltitudeDegrees: "適用下限の幾何高度",
  pressureHpa: "気圧",
  relativeHumidityPercent: "相対湿度",
  temperatureCelsius: "気温",
  wavelengthMicrometers: "観測波長",
};

function initialDraft(
  current: AppliedRefraction | null,
  manualDraftAtmosphere: Atmosphere | null,
): AtmosphereDraft {
  const atmosphere =
    current?.inputSource === "manual"
      ? current.atmosphere
      : manualDraftAtmosphere ?? STANDARD_VISUAL_ATMOSPHERE;
  return {
    minimumGeometricAltitudeDegrees: editableNumber(
      atmosphere.minimumGeometricAltitudeDegrees ?? 5,
    ),
    pressureHpa: editableNumber(atmosphere.pressureHpa),
    relativeHumidityPercent: editableNumber(
      atmosphere.relativeHumidity * 100,
    ),
    temperatureCelsius: editableNumber(
      atmosphere.temperatureCelsius,
    ),
    wavelengthMicrometers: editableNumber(
      atmosphere.wavelengthMicrometers,
    ),
  };
}

function parseRequiredNumber(
  draft: AtmosphereDraft,
  field: AtmosphereField,
  errors: AtmosphereFieldErrors,
) {
  const text = normalizeNumericText(draft[field]).trim();
  const value = Number(text);
  if (text.length === 0 || !Number.isFinite(value)) {
    errors[field] = `${FIELD_LABELS[field]}を数値で入力してください。`;
    return null;
  }
  return value;
}

function normalizeNumericText(text: string) {
  return text
    .replace(/[\u2212\uFE63\uFF0D]/g, "-")
    .replace(/[\uFF0B\uFE62]/g, "+")
    .replace(/^(\s*)\+/, "$1");
}

function rangeError(
  errors: AtmosphereFieldErrors,
  field: AtmosphereField,
  value: number | null,
  minimum: number,
  maximum: number,
  message: string,
) {
  if (value !== null && (value < minimum || value > maximum)) {
    errors[field] = message;
  }
}

/**
 * Parses every field, applies the UI guardrails, then exercises the same
 * domain coefficient and altitude-domain APIs used by the sky calculation.
 */
function validateAtmosphereDraft(
  draft: AtmosphereDraft,
): AtmosphereDraftValidation {
  const errors: AtmosphereFieldErrors = {};
  const pressureHpa = parseRequiredNumber(
    draft,
    "pressureHpa",
    errors,
  );
  const temperatureCelsius = parseRequiredNumber(
    draft,
    "temperatureCelsius",
    errors,
  );
  const relativeHumidityPercent = parseRequiredNumber(
    draft,
    "relativeHumidityPercent",
    errors,
  );
  const wavelengthMicrometers = parseRequiredNumber(
    draft,
    "wavelengthMicrometers",
    errors,
  );
  const minimumGeometricAltitudeDegrees = parseRequiredNumber(
    draft,
    "minimumGeometricAltitudeDegrees",
    errors,
  );

  rangeError(
    errors,
    "pressureHpa",
    pressureHpa,
    0,
    1_100,
    "気圧は0〜1,100 hPaで入力してください。",
  );
  rangeError(
    errors,
    "temperatureCelsius",
    temperatureCelsius,
    -100,
    60,
    "気温は−100〜60°Cで入力してください。",
  );
  rangeError(
    errors,
    "relativeHumidityPercent",
    relativeHumidityPercent,
    0,
    100,
    "相対湿度は0〜100%で入力してください。",
  );
  rangeError(
    errors,
    "wavelengthMicrometers",
    wavelengthMicrometers,
    0.3,
    2,
    "観測波長は0.3〜2 µmで入力してください。",
  );
  rangeError(
    errors,
    "minimumGeometricAltitudeDegrees",
    minimumGeometricAltitudeDegrees,
    5,
    30,
    "適用下限の幾何高度は5〜30°で入力してください。",
  );

  if (
    Object.keys(errors).length > 0 ||
    pressureHpa === null ||
    temperatureCelsius === null ||
    relativeHumidityPercent === null ||
    wavelengthMicrometers === null ||
    minimumGeometricAltitudeDegrees === null
  ) {
    return {
      atmosphere: null,
      errors,
      ok: false,
      summary: "入力内容を確認してください。大気設定はまだ変更されていません。",
    };
  }

  const atmosphere = Object.freeze<Atmosphere>({
    minimumGeometricAltitudeDegrees,
    pressureHpa,
    relativeHumidity: relativeHumidityPercent / 100,
    temperatureCelsius,
    wavelengthMicrometers,
  });

  try {
    const coefficients = refractionCoefficients(atmosphere);
    applyVisualRefractionWithCoefficients(
      (minimumGeometricAltitudeDegrees * Math.PI) / 180,
      coefficients,
      minimumGeometricAltitudeDegrees,
    );
  } catch {
    return {
      atmosphere: null,
      errors: {},
      ok: false,
      summary:
        "この気象条件では安定した大気差を計算できません。値を見直してください。大気設定はまだ変更されていません。",
    };
  }

  return {
    atmosphere,
    errors: {},
    ok: true,
    summary: null,
  };
}

export function AtmosphereDialog({
  current,
  manualDraftAtmosphere = null,
  onApply,
  onClose,
  open,
}: AtmosphereDialogProps) {
  const [draft, setDraft] = useState(() =>
    initialDraft(current, manualDraftAtmosphere),
  );
  const [errors, setErrors] = useState<AtmosphereFieldErrors>({});
  const [summary, setSummary] = useState<string | null>(null);

  function updateField(field: AtmosphereField, value: string) {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => {
      if (!previous[field]) {
        return previous;
      }
      const next = { ...previous };
      delete next[field];
      return next;
    });
    setSummary(null);
  }

  function normalizePastedNumber(
    event: ClipboardEvent<HTMLInputElement>,
    field: AtmosphereField,
  ) {
    const pasted = event.clipboardData.getData("text");
    const normalized = normalizeNumericText(pasted);
    if (normalized === pasted) {
      return;
    }
    event.preventDefault();
    updateField(field, normalized);
  }

  function applyManual() {
    const validation = validateAtmosphereDraft(draft);
    if (!validation.ok) {
      setErrors(validation.errors);
      setSummary(validation.summary);
      return;
    }
    onApply(
      Object.freeze({
        atmosphere: validation.atmosphere,
        inputSource: "manual",
      }),
    );
  }

  const currentLabel = current
    ? `${atmosphereSourceLabel(current.inputSource)}を適用中`
    : "オフ（大気差なし）";

  return (
    <Dialog
      description="標準大気、またはこのセッションだけで使う気象値を選べます。編集途中の値は星図へ反映されません。"
      onClose={onClose}
      open={open}
      title="大気差設定"
    >
      <section
        aria-labelledby="applied-atmosphere-title"
        className="atmosphere-dialog__current"
      >
        <h3 id="applied-atmosphere-title">現在の設定</h3>
        <strong>{currentLabel}</strong>
        {current ? (
          <p>{atmosphereValueSummary(current.atmosphere)}</p>
        ) : (
          <p>観測高度には真空中の幾何高度を表示しています。</p>
        )}
      </section>

      <form
        className="atmosphere-dialog__form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          applyManual();
        }}
      >
        <fieldset>
          <legend>手動大気</legend>
          <p className="form-note">
            5項目をまとめて検証し、「手動値を適用」を押した時だけ計算を切り替えます。
          </p>
          <div className="form-row atmosphere-dialog__grid">
            <label className="form-field">
              <span>気圧（hPa）</span>
              <input
                aria-label="気圧（hPa）"
                aria-describedby={
                  errors.pressureHpa
                    ? "atmosphere-pressure-error"
                    : undefined
                }
                aria-invalid={Boolean(errors.pressureHpa)}
                autoComplete="off"
                inputMode="decimal"
                max="1100"
                min="0"
                onChange={(event) =>
                  updateField("pressureHpa", event.target.value)
                }
                onPaste={(event) =>
                  normalizePastedNumber(event, "pressureHpa")
                }
                step="0.01"
                type="number"
                value={draft.pressureHpa}
              />
              {errors.pressureHpa ? (
                <span
                  className="form-field__error"
                  id="atmosphere-pressure-error"
                >
                  {errors.pressureHpa}
                </span>
              ) : null}
            </label>
            <label className="form-field">
              <span>気温（°C）</span>
              <input
                aria-label="気温（°C）"
                aria-describedby={
                  errors.temperatureCelsius
                    ? "atmosphere-temperature-error"
                    : undefined
                }
                aria-invalid={Boolean(errors.temperatureCelsius)}
                autoComplete="off"
                inputMode="decimal"
                max="60"
                min="-100"
                onChange={(event) =>
                  updateField(
                    "temperatureCelsius",
                    event.target.value,
                  )
                }
                onPaste={(event) =>
                  normalizePastedNumber(
                    event,
                    "temperatureCelsius",
                  )
                }
                step="0.1"
                type="number"
                value={draft.temperatureCelsius}
              />
              {errors.temperatureCelsius ? (
                <span
                  className="form-field__error"
                  id="atmosphere-temperature-error"
                >
                  {errors.temperatureCelsius}
                </span>
              ) : null}
            </label>
            <label className="form-field">
              <span>相対湿度（%）</span>
              <input
                aria-label="相対湿度（%）"
                aria-describedby={
                  errors.relativeHumidityPercent
                    ? "atmosphere-humidity-error"
                    : undefined
                }
                aria-invalid={Boolean(
                  errors.relativeHumidityPercent,
                )}
                autoComplete="off"
                inputMode="decimal"
                max="100"
                min="0"
                onChange={(event) =>
                  updateField(
                    "relativeHumidityPercent",
                    event.target.value,
                  )
                }
                onPaste={(event) =>
                  normalizePastedNumber(
                    event,
                    "relativeHumidityPercent",
                  )
                }
                step="0.1"
                type="number"
                value={draft.relativeHumidityPercent}
              />
              {errors.relativeHumidityPercent ? (
                <span
                  className="form-field__error"
                  id="atmosphere-humidity-error"
                >
                  {errors.relativeHumidityPercent}
                </span>
              ) : null}
            </label>
            <label className="form-field">
              <span>観測波長（µm）</span>
              <input
                aria-label="観測波長（µm）"
                aria-describedby={
                  errors.wavelengthMicrometers
                    ? "atmosphere-wavelength-error"
                    : "atmosphere-wavelength-note"
                }
                aria-invalid={Boolean(
                  errors.wavelengthMicrometers,
                )}
                autoComplete="off"
                inputMode="decimal"
                max="2"
                min="0.3"
                onChange={(event) =>
                  updateField(
                    "wavelengthMicrometers",
                    event.target.value,
                  )
                }
                onPaste={(event) =>
                  normalizePastedNumber(
                    event,
                    "wavelengthMicrometers",
                  )
                }
                step="0.01"
                type="number"
                value={draft.wavelengthMicrometers}
              />
              {errors.wavelengthMicrometers ? (
                <span
                  className="form-field__error"
                  id="atmosphere-wavelength-error"
                >
                  {errors.wavelengthMicrometers}
                </span>
              ) : (
                <span
                  className="form-field__hint"
                  id="atmosphere-wavelength-note"
                >
                  光学・近赤外の0.3〜2 µmに対応します。
                </span>
              )}
            </label>
          </div>
          <label className="form-field">
            <span>適用下限の幾何高度（°）</span>
            <input
              aria-label="適用下限の幾何高度（°）"
              aria-describedby={
                errors.minimumGeometricAltitudeDegrees
                  ? "atmosphere-altitude-error"
                  : "atmosphere-altitude-note"
              }
              aria-invalid={Boolean(
                errors.minimumGeometricAltitudeDegrees,
              )}
              autoComplete="off"
              inputMode="decimal"
              max="30"
              min="5"
              onChange={(event) =>
                updateField(
                  "minimumGeometricAltitudeDegrees",
                  event.target.value,
                )
              }
              onPaste={(event) =>
                normalizePastedNumber(
                  event,
                  "minimumGeometricAltitudeDegrees",
                )
              }
              step="0.1"
              type="number"
              value={draft.minimumGeometricAltitudeDegrees}
            />
            {errors.minimumGeometricAltitudeDegrees ? (
              <span
                className="form-field__error"
                id="atmosphere-altitude-error"
              >
                {errors.minimumGeometricAltitudeDegrees}
              </span>
            ) : (
              <span className="form-field__hint" id="atmosphere-altitude-note">
                この高度より低い星には大気差を適用しません。
              </span>
            )}
          </label>
        </fieldset>

        {summary ? (
          <p className="notice notice--error" role="alert">
            {summary}
          </p>
        ) : null}

        <div className="dialog__actions atmosphere-dialog__actions">
          <button
            className="button button--ghost"
            onClick={onClose}
            type="button"
          >
            キャンセル
          </button>
          <button
            className="button button--secondary"
            onClick={() => onApply(STANDARD_APPLIED_REFRACTION)}
            type="button"
          >
            標準大気を適用
          </button>
          <button className="button button--primary" type="submit">
            手動値を適用
          </button>
        </div>
      </form>
    </Dialog>
  );
}
