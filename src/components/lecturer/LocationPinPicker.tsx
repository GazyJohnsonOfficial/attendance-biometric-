import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertTriangle, Compass, MapPin, Navigation } from 'lucide-react';

export interface LocationPinValue {
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  pinMoved: boolean;
  locationSkipped: boolean;
}

interface Props {
  value: LocationPinValue;
  radiusM: number;
  onChange: (next: LocationPinValue) => void;
}

const DEFAULT_LAT = 4.9016;
const DEFAULT_LNG = -1.7831;

function createPinIcon() {
  return L.divIcon({
    className: 'custom-leaflet-pin',
    html: `<div style="width:28px;height:28px;border-radius:9999px;background:#2c7a6b;border:3px solid #ffffff;box-shadow:0 4px 12px rgba(24,38,48,0.35);display:grid;place-items:center;"><div style="width:8px;height:8px;border-radius:9999px;background:#f5c556;"></div></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export function LocationPinPicker({ value, radiusM, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');

  const lat = value.lat ?? DEFAULT_LAT;
  const lng = value.lng ?? DEFAULT_LNG;

  useEffect(() => {
    if (value.locationSkipped || !containerRef.current || mapRef.current) {
      return undefined;
    }

    const map = L.map(containerRef.current, {
      center: [lat, lng],
      zoom: 17,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker([lat, lng], {
      draggable: true,
      icon: createPinIcon(),
    }).addTo(map);

    const circle = L.circle([lat, lng], {
      radius: radiusM,
      color: '#2c7a6b',
      fillColor: '#2c7a6b',
      fillOpacity: 0.14,
      weight: 1.5,
    }).addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      onChange({
        ...value,
        lat: Number(pos.lat.toFixed(5)),
        lng: Number(pos.lng.toFixed(5)),
        pinMoved: true,
      });
    });

    map.on('click', (ev: L.LeafletMouseEvent) => {
      onChange({
        ...value,
        lat: Number(ev.latlng.lat.toFixed(5)),
        lng: Number(ev.latlng.lng.toFixed(5)),
        pinMoved: true,
      });
    });

    mapRef.current = map;
    markerRef.current = marker;
    circleRef.current = circle;

    const timer = window.setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      window.clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
  }, [value.locationSkipped]);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !circleRef.current || value.locationSkipped) return;
    markerRef.current.setLatLng([lat, lng]);
    circleRef.current.setLatLng([lat, lng]);
    circleRef.current.setRadius(radiusM);
    mapRef.current.panTo([lat, lng], { animate: true });
  }, [lat, lng, radiusM, value.locationSkipped]);

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Browser location is not available. Drag the pin on the map instead.');
      return;
    }
    setLocating(true);
    setGeoError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange({
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
          accuracyM: Math.round(pos.coords.accuracy),
          pinMoved: false,
          locationSkipped: false,
        });
      },
      () => {
        setLocating(false);
        setGeoError('Could not read GPS location. Move the pin manually or skip geofencing.');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  };

  return (
    <div className="rounded-xl border bg-muted/20 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <MapPin size={14} className="text-primary" />
          <span>Classroom location pin</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!value.locationSkipped && (
            <button
              type="button"
              onClick={useMyLocation}
              disabled={locating}
              className="btn btn-outline !px-2.5 !py-1.5 !text-xs whitespace-nowrap shrink-0"
              data-testid="button-use-my-location"
            >
              <Navigation size={13} /> {locating ? 'Locating…' : 'Use my location'}
            </button>
          )}
          <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              className="accent-primary"
              checked={value.locationSkipped}
              onChange={(e) =>
                onChange({
                  ...value,
                  locationSkipped: e.target.checked,
                })
              }
              data-testid="checkbox-skip-location"
            />
            Skip geofence
          </label>
        </div>
      </div>

      {value.locationSkipped ? (
        <p className="mt-2.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Geofence backup skipped. Check-ins will rely on the rotating code and biometric verification only.
        </p>
      ) : (
        <>
          <div
            ref={containerRef}
            className="mt-3 h-48 w-full overflow-hidden rounded-lg border bg-muted"
            data-testid="map-location-picker"
          />
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
              <Compass size={12} /> {lat.toFixed(4)}, {lng.toFixed(4)} · radius {radiusM} m
            </span>
            <span className="font-mono tabular-nums">
              {value.accuracyM != null ? `GPS accuracy: ±${value.accuracyM} m` : 'Click map or drag pin to adjust'}
            </span>
          </div>
          {value.accuracyM != null && value.accuracyM > 200 && (
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                GPS accuracy is low (&gt; 200 m). Drag the pin directly onto the lecture hall before opening check-in.
              </span>
            </div>
          )}
        </>
      )}
      {geoError && <p className="mt-2 text-xs text-amber-800">{geoError}</p>}
    </div>
  );
}
