import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Polyline, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import { motion } from "framer-motion";
import { Play, Pause, Square, Footprints, Clock, Flame, Loader2, MapPin, Trash2, ChevronLeft } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

// Fix default marker icon issue with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

type GeoPoint = { lat: number; lng: number; t: number };

interface RunRow {
  id: string;
  title: string;
  distance_m: number;
  duration_s: number;
  avg_pace_s_per_km: number | null;
  calories: number | null;
  path: GeoPoint[];
  created_at: string;
}

const haversine = (a: GeoPoint, b: GeoPoint) => {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const formatTime = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h > 0 ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
};

const formatPace = (s: number) => {
  if (!isFinite(s) || s <= 0) return "--:--";
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, "0")}`;
};

function FollowUser({ position }: { position: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.panTo(position, { animate: true });
  }, [position, map]);
  return null;
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) {
      map.fitBounds(points as any, { padding: [40, 40] });
    } else if (points.length === 1) {
      map.setView(points[0], 16);
    }
  }, [points, map]);
  return null;
}

export default function RunsPage() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [view, setView] = useState<"home" | "tracking" | "detail">("home");
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RunRow | null>(null);

  // Tracking state
  const [tracking, setTracking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [path, setPath] = useState<GeoPoint[]>([]);
  const [distance, setDistance] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [pos, setPos] = useState<[number, number] | null>(null);
  const watchRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const pausedRef = useRef(false);

  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => { loadRuns(); }, [user?.id]);

  useEffect(() => () => { stopTimers(); }, []);

  // Get initial position for the map
  useEffect(() => {
    if (!pos && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setPos([p.coords.latitude, p.coords.longitude]),
        () => setPos([-23.55, -46.63]), // fallback: São Paulo
        { enableHighAccuracy: false, timeout: 5000 }
      );
    }
  }, []);

  async function loadRuns() {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("runs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error && data) setRuns(data as any);
    setLoading(false);
  }

  function stopTimers() {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    if (timerRef.current !== null) clearInterval(timerRef.current);
    watchRef.current = null;
    timerRef.current = null;
  }

  const startTracking = () => {
    if (!navigator.geolocation) {
      toast({ title: "GPS não disponível", variant: "destructive" });
      return;
    }
    setPath([]);
    setDistance(0);
    setElapsed(0);
    setPaused(false);
    setTracking(true);
    setView("tracking");

    watchRef.current = navigator.geolocation.watchPosition(
      (p) => {
        if (pausedRef.current) return;
        const pt: GeoPoint = { lat: p.coords.latitude, lng: p.coords.longitude, t: Date.now() };
        setPos([pt.lat, pt.lng]);
        setPath((prev) => {
          if (prev.length > 0) {
            const last = prev[prev.length - 1];
            const d = haversine(last, pt);
            // ignore noise
            if (d < 3) return prev;
            setDistance((dd) => dd + d);
          }
          return [...prev, pt];
        });
      },
      (err) => {
        toast({ title: "Erro de GPS", description: err.message, variant: "destructive" });
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );

    timerRef.current = window.setInterval(() => {
      if (!pausedRef.current) setElapsed((s) => s + 1);
    }, 1000);
  };

  const finishTracking = async () => {
    stopTimers();
    setTracking(false);
    if (path.length < 2 || elapsed < 5) {
      toast({ title: "Corrida muito curta", description: "Precisa de mais pontos GPS." });
      setView("home");
      return;
    }
    if (!user) return;
    const km = distance / 1000;
    const pace = km > 0 ? elapsed / km : null;
    const weight = profile?.weight ?? 70;
    // approx calories: METs (running ~ 9.8) * weight * hours
    const calories = Math.round(9.8 * weight * (elapsed / 3600));

    const { data, error } = await supabase
      .from("runs")
      .insert({
        user_id: user.id,
        title: `Corrida de ${new Date().toLocaleDateString("pt-BR")}`,
        distance_m: Math.round(distance),
        duration_s: elapsed,
        avg_pace_s_per_km: pace,
        calories,
        path,
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      setView("home");
      return;
    }
    toast({ title: "Corrida salva! 🏃" });
    setRuns((r) => [data as any, ...r]);
    setSelected(data as any);
    setView("detail");
  };

  const cancelTracking = () => {
    if (!confirm("Cancelar e descartar esta corrida?")) return;
    stopTimers();
    setTracking(false);
    setView("home");
  };

  const deleteRun = async (id: string) => {
    if (!confirm("Excluir esta corrida?")) return;
    const { error } = await supabase.from("runs").delete().eq("id", id);
    if (error) return toast({ title: "Erro", variant: "destructive" });
    setRuns((r) => r.filter((x) => x.id !== id));
    if (selected?.id === id) { setSelected(null); setView("home"); }
  };

  // ---------------- Tracking view ----------------
  if (view === "tracking") {
    const km = distance / 1000;
    const pace = km > 0 ? elapsed / km : 0;
    const polyPoints = path.map((p) => [p.lat, p.lng]) as [number, number][];
    return (
      <div className="fixed inset-0 z-40 bg-background flex flex-col">
        <div className="flex-1 relative">
          {pos && (
            <MapContainer center={pos} zoom={17} className="w-full h-full" zoomControl={false}>
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; OpenStreetMap'
              />
              {polyPoints.length > 1 && (
                <Polyline positions={polyPoints} pathOptions={{ color: "hsl(96, 85%, 55%)", weight: 5, opacity: 0.9 }} />
              )}
              {pos && <Marker position={pos} />}
              <FollowUser position={pos} />
            </MapContainer>
          )}
          <div className="absolute top-4 left-4 right-4 z-[400] glass rounded-2xl px-4 py-3 flex items-center justify-between shadow-neon">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${paused ? "bg-yellow-500" : "bg-primary animate-pulse"}`} />
              <span className="text-xs font-bold">{paused ? "Pausado" : "Gravando"}</span>
            </div>
            <span className="text-xs text-muted-foreground">{path.length} pts</span>
          </div>
        </div>

        <div className="glass border-t border-border/50 px-5 py-5 space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label="Distância" value={km.toFixed(2)} unit="km" />
            <Stat label="Tempo" value={formatTime(elapsed)} />
            <Stat label="Pace" value={formatPace(pace)} unit="/km" />
          </div>
          <div className="flex gap-3">
            <button
              onClick={cancelTracking}
              className="flex-1 bg-secondary text-foreground font-bold py-3.5 rounded-xl"
            >
              Cancelar
            </button>
            <button
              onClick={() => setPaused((p) => !p)}
              className="flex-1 bg-secondary text-foreground font-bold py-3.5 rounded-xl flex items-center justify-center gap-2"
            >
              {paused ? <Play size={16} /> : <Pause size={16} />}
              {paused ? "Continuar" : "Pausar"}
            </button>
            <button
              onClick={finishTracking}
              className="flex-1 bg-gradient-primary text-primary-foreground font-bold py-3.5 rounded-xl shadow-neon flex items-center justify-center gap-2"
            >
              <Square size={14} /> Finalizar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------- Detail view ----------------
  if (view === "detail" && selected) {
    const km = selected.distance_m / 1000;
    const polyPoints = (selected.path || []).map((p) => [p.lat, p.lng]) as [number, number][];
    return (
      <div className="min-h-screen pb-24 max-w-lg mx-auto">
        <div className="px-4 pt-6 flex items-center gap-3 mb-4">
          <button onClick={() => { setSelected(null); setView("home"); }} className="p-2 rounded-xl bg-secondary">
            <ChevronLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="font-bold font-display">{selected.title}</h1>
            <p className="text-[11px] text-muted-foreground">
              {formatDistanceToNow(new Date(selected.created_at), { addSuffix: true, locale: ptBR })}
            </p>
          </div>
          <button onClick={() => deleteRun(selected.id)} className="p-2 text-muted-foreground hover:text-destructive">
            <Trash2 size={16} />
          </button>
        </div>
        <div className="h-72 mx-4 rounded-2xl overflow-hidden glow-border">
          {polyPoints.length > 0 ? (
            <MapContainer center={polyPoints[0]} zoom={15} className="w-full h-full" scrollWheelZoom={false}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
              <Polyline positions={polyPoints} pathOptions={{ color: "hsl(96, 85%, 55%)", weight: 5 }} />
              <Marker position={polyPoints[0]} />
              <Marker position={polyPoints[polyPoints.length - 1]} />
              <FitBounds points={polyPoints} />
            </MapContainer>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
              Sem dados de rota
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 px-4 mt-4">
          <DetailStat icon={MapPin} label="Distância" value={`${km.toFixed(2)} km`} />
          <DetailStat icon={Clock} label="Tempo" value={formatTime(selected.duration_s)} />
          <DetailStat icon={Footprints} label="Pace médio" value={`${formatPace(selected.avg_pace_s_per_km || 0)} /km`} />
          <DetailStat icon={Flame} label="Calorias" value={`${selected.calories ?? 0} kcal`} />
        </div>
        <BottomNav />
      </div>
    );
  }

  // ---------------- Home view ----------------
  const totalKm = runs.reduce((s, r) => s + r.distance_m, 0) / 1000;
  const totalTime = runs.reduce((s, r) => s + r.duration_s, 0);

  return (
    <div className="min-h-screen pb-28 px-4 pt-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl bg-gradient-primary flex items-center justify-center shadow-neon">
          <Footprints size={22} className="text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-display">
            <span className="text-gradient">Corridas</span>
          </h1>
          <p className="text-xs text-muted-foreground">Rastreie suas rotas com GPS</p>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <Stat label="Total" value={totalKm.toFixed(1)} unit="km" />
        <Stat label="Sessões" value={String(runs.length)} />
        <Stat label="Tempo" value={formatTime(totalTime)} />
      </div>

      {/* Map preview + start */}
      <div className="relative rounded-2xl overflow-hidden glow-border mb-5 h-56">
        {pos ? (
          <MapContainer center={pos} zoom={14} className="w-full h-full" scrollWheelZoom={false} dragging={false} zoomControl={false}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OSM' />
            <Marker position={pos} />
          </MapContainer>
        ) : (
          <div className="w-full h-full bg-secondary/40 flex items-center justify-center text-sm text-muted-foreground">
            <Loader2 size={20} className="animate-spin mr-2" /> Localizando...
          </div>
        )}
        <button
          onClick={startTracking}
          className="absolute inset-x-4 bottom-4 z-[400] bg-gradient-primary text-primary-foreground font-bold py-3.5 rounded-xl shadow-neon flex items-center justify-center gap-2"
        >
          <Play size={16} /> Iniciar corrida
        </button>
      </div>

      <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
        Histórico
      </h2>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>
      ) : runs.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
          Nenhuma corrida ainda. Comece a primeira! 🏃
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((r) => {
            const km = r.distance_m / 1000;
            return (
              <motion.button
                key={r.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => { setSelected(r); setView("detail"); }}
                className="w-full glass rounded-2xl p-4 flex items-center gap-3 text-left"
              >
                <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center">
                  <Footprints size={18} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{r.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold font-display text-primary">{km.toFixed(2)} km</p>
                  <p className="text-[10px] text-muted-foreground">{formatTime(r.duration_s)}</p>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      <BottomNav />
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="glass rounded-2xl p-3 text-center">
      <p className="text-2xl font-bold font-display text-gradient leading-none">
        {value}
        {unit && <span className="text-xs text-muted-foreground ml-0.5">{unit}</span>}
      </p>
      <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">{label}</p>
    </div>
  );
}

function DetailStat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <Icon size={16} className="text-primary mb-2" />
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="font-bold font-display text-lg">{value}</p>
    </div>
  );
}
