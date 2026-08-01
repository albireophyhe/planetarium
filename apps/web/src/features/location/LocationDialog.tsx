import { LocateFixedIcon, MapPinIcon } from "lucide-react";
import { useState } from "react";
import type { City } from "../../domain";
import type {
  LocationNotice,
  ObserverLocation,
} from "../../app/types";
import { Dialog } from "../../ui/Dialog";

type LocationDialogProps = {
  cities: readonly City[];
  currentLocation: ObserverLocation;
  onApply: (location: ObserverLocation) => void;
  onClose: () => void;
  open: boolean;
};

function hasValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("ja-JP", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

function validateCoordinates(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return "緯度は−90°から90°の数値で入力してください。";
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return "経度は−180°から180°の数値で入力してください。";
  }
  return null;
}

function validateHeight(heightMeters: number) {
  if (
    !Number.isFinite(heightMeters) ||
    heightMeters < -500 ||
    heightMeters > 10_000
  ) {
    return "標高は−500 mから10,000 mの数値で入力してください。";
  }
  return null;
}

export function LocationDialog({
  cities,
  currentLocation,
  onApply,
  onClose,
  open,
}: LocationDialogProps) {
  const [heightMeters, setHeightMeters] = useState(
    String(currentLocation.heightMeters),
  );
  const [horizontalAccuracyMeters, setHorizontalAccuracyMeters] =
    useState<number | null>(
      currentLocation.horizontalAccuracyMeters,
    );
  const [latitude, setLatitude] = useState(String(currentLocation.latitude));
  const [locationSource, setLocationSource] = useState(
    currentLocation.locationSource,
  );
  const [longitude, setLongitude] = useState(String(currentLocation.longitude));
  const [name, setName] = useState(currentLocation.name);
  const [notice, setNotice] = useState<LocationNotice>(null);
  const [requestingLocation, setRequestingLocation] = useState(false);
  const [timeZone, setTimeZone] = useState(currentLocation.timeZone);

  function chooseCity(cityId: string) {
    const city = cities.find((candidate) => candidate.id === cityId);
    if (!city) {
      return;
    }
    setName(city.nameJa);
    setHeightMeters("0");
    setHorizontalAccuracyMeters(null);
    setLatitude(String(city.latitude));
    setLocationSource("bundled-city");
    setLongitude(String(city.longitude));
    setTimeZone(city.timeZone);
    setNotice({
      kind: "info",
      message: `${city.nameJa}を選びました。`,
    });
  }

  function requestCurrentLocation() {
    if (!navigator.geolocation) {
      setNotice({
        kind: "error",
        message:
          "このブラウザでは現在地を取得できません。都市または緯度・経度を選んでください。",
      });
      return;
    }

    setRequestingLocation(true);
    setNotice({
      kind: "info",
      message: "ブラウザの位置確認を待っています…",
    });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const resolvedTimeZone =
          Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const altitude = position.coords.altitude;
        const heightIsAvailable = altitude !== null;
        const resolvedHeightMeters =
          altitude === null ? 0 : Math.round(altitude);
        const verticalAccuracy =
          position.coords.altitudeAccuracy;
        setName("現在地");
        setHeightMeters(String(resolvedHeightMeters));
        setHorizontalAccuracyMeters(position.coords.accuracy);
        setLatitude(position.coords.latitude.toFixed(6));
        setLocationSource("device-geolocation");
        setLongitude(position.coords.longitude.toFixed(6));
        setTimeZone(resolvedTimeZone);
        setRequestingLocation(false);
        setNotice({
          kind: "info",
          message:
            `現在地を取得しました（水平精度 ±${position.coords.accuracy.toFixed(0)} m・` +
            (heightIsAvailable
              ? `WGS84楕円体高 ${resolvedHeightMeters} m${
                  verticalAccuracy === null
                    ? ""
                    : `、垂直精度 ±${verticalAccuracy.toFixed(0)} m`
                }`
              : "楕円体高は取得できず0 m近似") +
            "）。地点の設定だけでは外部送信せず、既定では保存しません。現在気象の明示取得でも気象庁には座標を送らず、実測を使えない場合だけ丸めた座標をOpen-Meteoへ送ります。",
        });
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? "位置情報の利用が許可されませんでした。都市または手入力を利用できます。"
            : "現在地を取得できませんでした。通信状態やOSの設定を確認してください。";
        setRequestingLocation(false);
        setNotice({ kind: "error", message });
      },
      {
        // This is an explicit, one-shot astronomy request. Prefer the most
        // accurate fix the device can provide so eclipse/occultation boundary
        // handling receives a meaningful horizontal-accuracy radius.
        enableHighAccuracy: true,
        maximumAge: 60_000,
        timeout: 15_000,
      },
    );
  }

  function applyManualLocation() {
    const heightValue = Number(heightMeters);
    const latitudeValue = Number(latitude);
    const longitudeValue = Number(longitude);
    const coordinateError = validateCoordinates(
      latitudeValue,
      longitudeValue,
    );
    if (coordinateError) {
      setNotice({ kind: "error", message: coordinateError });
      return;
    }
    const heightError = validateHeight(heightValue);
    if (heightError) {
      setNotice({ kind: "error", message: heightError });
      return;
    }
    if (!hasValidTimeZone(timeZone)) {
      setNotice({
        kind: "error",
        message:
          "タイムゾーンは Asia/Tokyo のようなIANA形式で入力してください。",
      });
      return;
    }

    onApply({
      heightMeters: heightValue,
      horizontalAccuracyMeters,
      id: `custom-${latitudeValue}-${longitudeValue}`,
      latitude: latitudeValue,
      locationSource,
      longitude: longitudeValue,
      name: name.trim() || "カスタム地点",
      timeZone,
    });
    onClose();
  }

  const matchingCity = cities.find(
    (city) =>
      city.latitude === Number(latitude) &&
      city.longitude === Number(longitude) &&
      city.timeZone === timeZone,
  );

  function markManualInput() {
    setHorizontalAccuracyMeters(null);
    setLocationSource("manual");
  }

  return (
    <Dialog
      description="都市プリセット、現在地、または緯度・経度から観測地点を選べます。"
      onClose={onClose}
      open={open}
      title="観測地点"
      wide
    >
      <div className="location-dialog__grid">
        <section>
          <h3>都市から選ぶ</h3>
          <label className="form-field">
            <span>都市</span>
            <select
              onChange={(event) => chooseCity(event.target.value)}
              value={matchingCity?.id ?? ""}
            >
              <option value="">カスタム地点</option>
              {cities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.nameJa} — {city.timeZone}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button button--secondary button--full"
            disabled={requestingLocation}
            onClick={requestCurrentLocation}
            type="button"
          >
            <LocateFixedIcon aria-hidden="true" size={19} strokeWidth={1.8} />
            {requestingLocation ? "現在地を確認中…" : "現在地を使用"}
          </button>
          <p className="form-note">
            このボタンを押した時だけ、ブラウザが精度を優先して位置情報を1回取得します。
          </p>
        </section>

        <section>
          <h3>詳細を入力</h3>
          <label className="form-field">
            <span>地点名</span>
            <input
              autoComplete="off"
              onChange={(event) => {
                markManualInput();
                setName(event.target.value);
              }}
              value={name}
            />
          </label>
          <div className="form-row">
            <label className="form-field">
              <span>緯度（北緯が正）</span>
              <input
                inputMode="decimal"
                max="90"
                min="-90"
                onChange={(event) => {
                  markManualInput();
                  setLatitude(event.target.value);
                }}
                step="0.000001"
                type="number"
                value={latitude}
              />
            </label>
            <label className="form-field">
              <span>経度（東経が正）</span>
              <input
                inputMode="decimal"
                max="180"
                min="-180"
                onChange={(event) => {
                  markManualInput();
                  setLongitude(event.target.value);
                }}
                step="0.000001"
                type="number"
                value={longitude}
              />
            </label>
          </div>
          <label className="form-field">
            <span>標高（楕円体高・m）</span>
            <input
              inputMode="decimal"
              max="10000"
              min="-500"
              onChange={(event) => {
                markManualInput();
                setHeightMeters(event.target.value);
              }}
              step="1"
              type="number"
              value={heightMeters}
            />
          </label>
          <label className="form-field">
            <span>タイムゾーン</span>
            <input
              autoCapitalize="off"
              autoComplete="off"
              onChange={(event) => {
                markManualInput();
                setTimeZone(event.target.value);
              }}
              placeholder="Asia/Tokyo"
              spellCheck="false"
              value={timeZone}
            />
          </label>
        </section>
      </div>

      {notice ? (
        <p
          className={`notice notice--${notice.kind}`}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          {notice.message}
        </p>
      ) : null}

      <footer className="dialog__actions">
        <button className="button button--ghost" onClick={onClose} type="button">
          キャンセル
        </button>
        <button
          className="button button--primary"
          onClick={applyManualLocation}
          type="button"
        >
          <MapPinIcon aria-hidden="true" size={18} strokeWidth={1.8} />
          この地点を表示
        </button>
      </footer>
    </Dialog>
  );
}
