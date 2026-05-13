import { useEffect, useRef, useState } from "react";
import { Bluetooth, Heart, Watch, Loader2 } from "lucide-react";
import { connectHeartRate, recordSample, syncNativeHealth, lastConnectedDevice } from "@/lib/smartwatch";
import { toast } from "sonner";

export default function SmartwatchPanel() {
  const [bpm, setBpm] = useState<number | null>(null);
  const [device, setDevice] = useState<string | null>(lastConnectedDevice());
  const [busy, setBusy] = useState(false);
  const disconnectRef = useRef<() => void>();
  const lastSaved = useRef(0);

  useEffect(() => () => disconnectRef.current?.(), []);

  const handleConnect = async () => {
    setBusy(true);
    try {
      const conn = await connectHeartRate((value) => {
        setBpm(value);
        // Save at most every 15s to avoid flooding the DB
        if (Date.now() - lastSaved.current > 15000) {
          lastSaved.current = Date.now();
          recordSample("heart_rate", value, "bpm", "ble").catch(() => {});
        }
      });
      disconnectRef.current = conn.disconnect;
      setDevice(conn.deviceName);
      toast.success(`Conectado: ${conn.deviceName}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  const handleNative = async () => {
    setBusy(true);
    const r = await syncNativeHealth();
    setBusy(false);
    if (r.ok) toast.success("Saúde sincronizada"); else toast.message(r.reason ?? "Indisponível");
  };

  const handleDisconnect = () => {
    disconnectRef.current?.();
    disconnectRef.current = undefined;
    setBpm(null);
    toast.message("Desconectado");
  };

  return (
    <div className="glass rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Watch size={18} className="text-primary" />
        <h3 className="font-bold text-sm">Smartwatch</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Conecte um relógio compatível (Polar, Garmin, Wahoo, qualquer monitor BLE) para receber os batimentos em tempo real.
        No app instalado, também é possível sincronizar com Health Connect / HealthKit.
      </p>

      <div className="flex items-center justify-between bg-secondary/60 rounded-xl p-3">
        <div className="flex items-center gap-2">
          <Heart size={16} className={bpm ? "text-primary animate-pulse" : "text-muted-foreground"} />
          <div>
            <div className="text-xs text-muted-foreground">Frequência cardíaca</div>
            <div className="text-lg font-bold">{bpm ?? "—"} <span className="text-xs font-normal text-muted-foreground">bpm</span></div>
          </div>
        </div>
        {device && <span className="text-[10px] text-muted-foreground">{device}</span>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {disconnectRef.current ? (
          <button onClick={handleDisconnect} className="bg-secondary rounded-xl py-2 text-xs font-bold">
            Desconectar
          </button>
        ) : (
          <button onClick={handleConnect} disabled={busy}
            className="bg-gradient-primary text-primary-foreground rounded-xl py-2 text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Bluetooth size={14} />} Bluetooth
          </button>
        )}
        <button onClick={handleNative} disabled={busy}
          className="bg-secondary rounded-xl py-2 text-xs font-bold flex items-center justify-center gap-1">
          <Watch size={14} /> Health Connect
        </button>
      </div>
    </div>
  );
}
