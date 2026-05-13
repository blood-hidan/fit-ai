// Smartwatch bridge: Web Bluetooth (Heart Rate Service) + Capacitor Health stub.
// Persists samples into smartwatch_samples for charts/coach.
import { supabase } from "@/integrations/supabase/client";

const HR_SERVICE = 0x180d;
const HR_CHAR = 0x2a37;

export type HRListener = (bpm: number) => void;

const BLE_KEY = "mf_ble_device_name";

export async function connectHeartRate(onBpm: HRListener): Promise<{ disconnect: () => void; deviceName: string }> {
  const nav = navigator as unknown as { bluetooth?: { requestDevice: (opts: unknown) => Promise<BluetoothDevice> } };
  if (!nav.bluetooth) throw new Error("Web Bluetooth não disponível neste dispositivo. Use Chrome/Android ou um build nativo.");

  const device = await nav.bluetooth.requestDevice({
    filters: [{ services: [HR_SERVICE] }],
    optionalServices: [HR_SERVICE],
  });

  const server = await device.gatt!.connect();
  const service = await server.getPrimaryService(HR_SERVICE);
  const char = await service.getCharacteristic(HR_CHAR);
  await char.startNotifications();

  const handler = (e: Event) => {
    const value = (e.target as unknown as { value: DataView }).value;
    // Heart Rate Measurement parsing per BLE spec
    const flags = value.getUint8(0);
    const is16 = (flags & 0x1) !== 0;
    const bpm = is16 ? value.getUint16(1, true) : value.getUint8(1);
    if (bpm > 0) onBpm(bpm);
  };
  char.addEventListener("characteristicvaluechanged", handler);

  const name = device.name || "Smartwatch";
  try { localStorage.setItem(BLE_KEY, name); } catch { /* ignore */ }

  return {
    deviceName: name,
    disconnect: () => {
      try {
        char.removeEventListener("characteristicvaluechanged", handler);
        char.stopNotifications();
        device.gatt?.disconnect();
      } catch { /* ignore */ }
    },
  };
}

export async function recordSample(metric: string, value: number, unit?: string, source = "ble") {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return;
  await supabase.from("smartwatch_samples").insert({
    user_id: uid, source, metric, value, unit: unit ?? null,
  });
}

// Capacitor Health Connect / HealthKit — stub that we can wire to a plugin
// (e.g. capacitor-health-connect / @perfood/capacitor-healthkit) in a native build.
export async function syncNativeHealth(): Promise<{ ok: boolean; reason?: string }> {
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  if (!w.Capacitor?.isNativePlatform?.()) {
    return { ok: false, reason: "Disponível apenas no app nativo (Android/iOS)." };
  }
  // TODO: integrar plugin nativo após build:
  //   Android  → npm i capacitor-health-connect && npx cap sync
  //   iOS      → npm i @perfood/capacitor-healthkit && npx cap sync
  return { ok: false, reason: "Plugin nativo ainda não instalado. Veja APK_BUILD_GUIDE.md." };
}

export function lastConnectedDevice() {
  try { return localStorage.getItem(BLE_KEY); } catch { return null; }
}
