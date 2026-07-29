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

export function LocationDialog({
  cities,
  currentLocation,
  onApply,
  onClose,
  open,
}: LocationDialogProps) {
  const [latitude, setLatitude] = useState(String(currentLocation.latitude));
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
    setLatitude(String(city.latitude));
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
        setName("現在地");
        setLatitude(position.coords.latitude.toFixed(5));
        setLongitude(position.coords.longitude.toFixed(5));
        setTimeZone(resolvedTimeZone);
        setRequestingLocation(false);
        setNotice({
          kind: "info",
          message:
            "現在地を取得しました。この座標はサーバーへ送信せず、既定では保存しません。",
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
        enableHighAccuracy: false,
        maximumAge: 300_000,
        timeout: 12_000,
      },
    );
  }

  function applyManualLocation() {
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
    if (!hasValidTimeZone(timeZone)) {
      setNotice({
        kind: "error",
        message:
          "タイムゾーンは Asia/Tokyo のようなIANA形式で入力してください。",
      });
      return;
    }

    onApply({
      id: `custom-${latitudeValue}-${longitudeValue}`,
      latitude: latitudeValue,
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
            このボタンを押した時だけ、ブラウザが位置情報の許可を求めます。
          </p>
        </section>

        <section>
          <h3>詳細を入力</h3>
          <label className="form-field">
            <span>地点名</span>
            <input
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
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
                onChange={(event) => setLatitude(event.target.value)}
                step="0.0001"
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
                onChange={(event) => setLongitude(event.target.value)}
                step="0.0001"
                type="number"
                value={longitude}
              />
            </label>
          </div>
          <label className="form-field">
            <span>タイムゾーン</span>
            <input
              autoCapitalize="off"
              autoComplete="off"
              onChange={(event) => setTimeZone(event.target.value)}
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
