import { useEffect, useRef, useState, useCallback } from "react";
import { MapContainer, TileLayer, Polyline, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Play, Pause, Square, Footprints, Clock, Flame, Loader2, 
  MapPin, Trash2, ChevronLeft, Zap, TrendingUp, Mountain,
  Navigation, Signal, Battery, Smartphone
} from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  GeoPoint,
  filterGPSNoise,
  calculateRunningCalories,
  calculateElevation,
  formatTime,
  formatPace,
  formatDistance,
  haversineDistance,
  calculateSpeed,
  requestWakeLock,
  releaseWakeLock,
} from "@/lib/running-utils";

// Fix default marker icon issue with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface RunRow {
  id: string;
  title: string;
  distance_m: number;
  duration_s: number;
  avg_pace_s_per_km: number | null;
  calories: number | null;
  path: GeoPoint[];
  created_at: string;
  elevation_gain?: number;
  max_speed?: number;
}

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
      map.fitBounds(points as L.LatLngBoundsExpression, { padding: [40, 40] });
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
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [gpsSignal, setGpsSignal] = useState<"none" | "weak" | "good" | "excellent">("none");
  
  const watchRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const lastPointRef = useRef<GeoPoint | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const maxSpeedRef = useRef(0);

  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { loadRuns(); }, [user?.id]);
  useEffect(() => () => { stopTimers(); }, []);

  // Get initial position for the map
  useEffect(() => {
    if (!pos && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          setPos([p.coords.latitude, p.coords.longitude]);
          updateGpsSignal(p.coords.accuracy);
        },
        () => setPos([-23.55, -46.63]), // fallback: São Paulo
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

  const updateGpsSignal = useCallback((accuracy: number) => {
    setGpsAccuracy(accuracy);
    if (accuracy <= 5) setGpsSignal("excellent");
    else if (accuracy <= 15) setGpsSignal("good");
    else if (accuracy <= 30) setGpsSignal("weak");
    else setGpsSignal("none");
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
    if (!error && data) setRuns(data as unknown as RunRow[]);
    setLoading(false);
  }

  function stopTimers() {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    if (timerRef.current !== null) clearInterval(timerRef.current);
    watchRef.current = null;
    timerRef.current = null;
    releaseWakeLock(wakeLockRef.current);
    wakeLockRef.current = null;
  }

  const startTracking = async () => {
    if (!navigator.geolocation) {
      toast({ title: "GPS não disponível", description: "Este dispositivo não suporta GPS.", variant: "destructive" });
      return;
    }

    // Request wake lock to keep screen on
    wakeLockRef.current = await requestWakeLock();

    setPath([]);
    setDistance(0);
    setElapsed(0);
    setCurrentSpeed(0);
    maxSpeedRef.current = 0;
    lastPointRef.current = null;
    setPaused(false);
    setTracking(true);
    setView("tracking");

    toast({ 
      title: "Rastreamento iniciado", 
      description: "Aguardando sinal GPS preciso..." 
    });

    watchRef.current = navigator.geolocation.watchPosition(
      (p) => {
        if (pausedRef.current) return;

        const newPoint: GeoPoint = { 
          lat: p.coords.latitude, 
          lng: p.coords.longitude, 
          t: Date.now(),
          accuracy: p.coords.accuracy,
          altitude: p.coords.altitude ?? undefined,
          speed: p.coords.speed ?? undefined,
        };

        // Update GPS signal quality
        updateGpsSignal(p.coords.accuracy);
        setPos([newPoint.lat, newPoint.lng]);

        // Use native speed if available, otherwise calculate
        if (p.coords.speed !== null && p.coords.speed >= 0) {
          const speedKmh = p.coords.speed * 3.6;
          setCurrentSpeed(speedKmh);
          if (speedKmh > maxSpeedRef.current && speedKmh < 45) {
            maxSpeedRef.current = speedKmh;
          }
        }

        // Filter GPS noise
        const { accept, distance: segmentDist, speed } = filterGPSNoise(
          newPoint, 
          lastPointRef.current,
          { minAccuracy: 25, maxSpeed: 40, minDistance: 2 }
        );

        if (accept) {
          if (lastPointRef.current && !p.coords.speed) {
            setCurrentSpeed(speed);
            if (speed > maxSpeedRef.current && speed < 45) {
              maxSpeedRef.current = speed;
            }
          }

          setPath((prev) => {
            if (prev.length > 0) {
              setDistance((dd) => dd + segmentDist);
            }
            return [...prev, newPoint];
          });

          lastPointRef.current = newPoint;
        }
      },
      (err) => {
        console.error("[MultiFit] GPS Error:", err);
        toast({ 
          title: "Erro de GPS", 
          description: getGPSErrorMessage(err.code), 
          variant: "destructive" 
        });
      },
      { 
        enableHighAccuracy: true, 
        maximumAge: 1000, 
        timeout: 15000 
      }
    );

    timerRef.current = window.setInterval(() => {
      if (!pausedRef.current) setElapsed((s) => s + 1);
    }, 1000);
  };

  const getGPSErrorMessage = (code: number): string => {
    switch (code) {
      case 1: return "Permissão de localização negada. Ative nas configurações.";
      case 2: return "Posição indisponível. Verifique se o GPS está ativo.";
      case 3: return "Tempo esgotado. Tente novamente em área aberta.";
      default: return "Erro desconhecido de GPS.";
    }
  };

  const finishTracking = async () => {
    stopTimers();
    setTracking(false);

    if (path.length < 2 || elapsed < 10) {
      toast({ 
        title: "Corrida muito curta", 
        description: "Precisa de mais tempo e pontos GPS para salvar." 
      });
      setView("home");
      return;
    }

    if (!user) return;

    const km = distance / 1000;
    const pace = km > 0 ? elapsed / km : null;
    const weight = profile?.weight ?? 70;
    const { gain: elevationGain } = calculateElevation(path);

    // Calculate calories using precise formula
    const calories = calculateRunningCalories(weight, elapsed, distance, elevationGain);

    const { data, error } = await supabase
      .from("runs")
      .insert({
        user_id: user.id,
        title: `Corrida de ${new Date().toLocaleDateString("pt-BR")}`,
        distance_m: Math.round(distance),
        duration_s: elapsed,
        avg_pace_s_per_km: pace,
        calories,
        path: path as any,
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      setView("home");
      return;
    }

    toast({ title: "Corrida salva com sucesso!" });
    setRuns((r) => [data as unknown as RunRow, ...r]);
    setSelected(data as unknown as RunRow);
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

  // Calculate real-time calories
  const liveCalories = useCallback(() => {
    const weight = profile?.weight ?? 70;
    return calculateRunningCalories(weight, elapsed, distance);
  }, [profile?.weight, elapsed, distance]);

  // ---------------- Tracking view ----------------
  if (view === "tracking") {
    const km = distance / 1000;
    const pace = km > 0 ? elapsed / km : 0;
    const polyPoints = path.map((p) => [p.lat, p.lng]) as [number, number][];
    const calories = liveCalories();

    return (
      <div className="fixed inset-0 z-40 bg-background flex flex-col safe-area-inset">
        <div className="flex-1 relative">
          {pos && (
            <MapContainer center={pos} zoom={17} className="w-full h-full" zoomControl={false}>
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap"
              />
              {polyPoints.length > 1 && (
                <Polyline 
                  positions={polyPoints} 
                  pathOptions={{ 
                    color: "hsl(96, 85%, 55%)", 
                    weight: 5, 
                    opacity: 0.9,
                    lineCap: "round",
                    lineJoin: "round"
                  }} 
                />
              )}
              {pos && <Marker position={pos} />}
              <FollowUser position={pos} />
            </MapContainer>
          )}

          {/* Status bar */}
          <div className="absolute top-4 left-4 right-4 z-[400] glass rounded-2xl px-4 py-3 flex items-center justify-between shadow-neon">
            <div className="flex items-center gap-3">
              <span className={`w-2.5 h-2.5 rounded-full ${paused ? "bg-yellow-500" : "bg-primary animate-pulse"}`} />
              <span className="text-xs font-bold">{paused ? "Pausado" : "Gravando"}</span>
            </div>
            <div className="flex items-center gap-3">
              <GPSSignalIndicator signal={gpsSignal} accuracy={gpsAccuracy} />
              <span className="text-xs text-muted-foreground">{path.length} pts</span>
            </div>
          </div>

          {/* Live speed indicator */}
          <AnimatePresence>
            {!paused && currentSpeed > 1 && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute top-20 right-4 z-[400] glass rounded-xl px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <Zap size={14} className="text-primary" />
                  <span className="text-sm font-bold">{currentSpeed.toFixed(1)} km/h</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="glass border-t border-border/50 px-5 py-5 space-y-4">
          <div className="grid grid-cols-4 gap-3 text-center">
            <Stat label="Distância" value={formatDistance(distance)} unit="km" highlight />
            <Stat label="Tempo" value={formatTime(elapsed)} />
            <Stat label="Pace" value={formatPace(pace)} unit="/km" />
            <Stat label="Calorias" value={String(calories)} unit="kcal" />
          </div>

          <div className="flex gap-3">
            <button
              onClick={cancelTracking}
              className="flex-1 bg-secondary text-foreground font-bold py-3.5 rounded-xl active:scale-95 transition-transform"
            >
              Cancelar
            </button>
            <button
              onClick={() => setPaused((p) => !p)}
              className="flex-1 bg-secondary text-foreground font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              {paused ? <Play size={16} /> : <Pause size={16} />}
              {paused ? "Continuar" : "Pausar"}
            </button>
            <button
              onClick={finishTracking}
              className="flex-1 bg-gradient-primary text-primary-foreground font-bold py-3.5 rounded-xl shadow-neon flex items-center justify-center gap-2 active:scale-95 transition-transform"
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
    const avgSpeed = selected.duration_s > 0 ? km / (selected.duration_s / 3600) : 0;

    return (
      <div className="min-h-screen pb-24 max-w-lg mx-auto">
        <div className="px-4 pt-6 flex items-center gap-3 mb-4">
          <button onClick={() => { setSelected(null); setView("home"); }} className="p-2 rounded-xl bg-secondary active:scale-95 transition-transform">
            <ChevronLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="font-bold font-display">{selected.title}</h1>
            <p className="text-[11px] text-muted-foreground">
              {formatDistanceToNow(new Date(selected.created_at), { addSuffix: true, locale: ptBR })}
            </p>
          </div>
          <button onClick={() => deleteRun(selected.id)} className="p-2 text-muted-foreground hover:text-destructive active:scale-95 transition-transform">
            <Trash2 size={16} />
          </button>
        </div>

        <div className="h-72 mx-4 rounded-2xl overflow-hidden glow-border">
          {polyPoints.length > 0 ? (
            <MapContainer center={polyPoints[0]} zoom={15} className="w-full h-full" scrollWheelZoom={false}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
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
          <DetailStat icon={Zap} label="Velocidade média" value={`${avgSpeed.toFixed(1)} km/h`} />
          <DetailStat icon={TrendingUp} label="Vel. máxima" value={`${selected.max_speed ?? 0} km/h`} />
        </div>

        {(selected.elevation_gain ?? 0) > 0 && (
          <div className="px-4 mt-3">
            <DetailStat 
              icon={Mountain} 
              label="Elevação" 
              value={`+${selected.elevation_gain ?? 0} m`} 
            />
          </div>
        )}

        <BottomNav />
      </div>
    );
  }

  // ---------------- Home view ----------------
  const totalKm = runs.reduce((s, r) => s + r.distance_m, 0) / 1000;
  const totalTime = runs.reduce((s, r) => s + r.duration_s, 0);
  const totalCalories = runs.reduce((s, r) => s + (r.calories ?? 0), 0);

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
      <div className="grid grid-cols-4 gap-2 mb-5">
        <Stat label="Total" value={totalKm.toFixed(1)} unit="km" />
        <Stat label="Sessões" value={String(runs.length)} />
        <Stat label="Tempo" value={formatTime(totalTime)} />
        <Stat label="Calorias" value={String(totalCalories)} unit="" />
      </div>

      {/* PWA Install hint */}
      <PWAInstallHint />

      {/* Map preview + start */}
      <div className="relative rounded-2xl overflow-hidden glow-border mb-5 h-56">
        {pos ? (
          <MapContainer center={pos} zoom={14} className="w-full h-full" scrollWheelZoom={false} dragging={false} zoomControl={false}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OSM" />
            <Marker position={pos} />
          </MapContainer>
        ) : (
          <div className="w-full h-full bg-secondary/40 flex items-center justify-center text-sm text-muted-foreground">
            <Loader2 size={20} className="animate-spin mr-2" /> Localizando...
          </div>
        )}
        <button
          onClick={startTracking}
          className="absolute inset-x-4 bottom-4 z-[400] bg-gradient-primary text-primary-foreground font-bold py-3.5 rounded-xl shadow-neon flex items-center justify-center gap-2 active:scale-95 transition-transform"
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
          Nenhuma corrida ainda. Comece a primeira!
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((r) => {
            const rkm = r.distance_m / 1000;
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
                  <p className="font-bold font-display text-primary">{rkm.toFixed(2)} km</p>
                  <p className="text-[10px] text-muted-foreground">{r.calories ?? 0} kcal</p>
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

function Stat({ label, value, unit, highlight }: { label: string; value: string; unit?: string; highlight?: boolean }) {
  return (
    <div className="glass rounded-2xl p-3 text-center">
      <p className={`text-xl font-bold font-display leading-none ${highlight ? "text-gradient" : ""}`}>
        {value}
        {unit && <span className="text-[10px] text-muted-foreground ml-0.5">{unit}</span>}
      </p>
      <p className="text-[9px] text-muted-foreground mt-1 uppercase tracking-wide">{label}</p>
    </div>
  );
}

function DetailStat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <Icon size={16} className="text-primary mb-2" />
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="font-bold font-display text-lg">{value}</p>
    </div>
  );
}

function GPSSignalIndicator({ signal, accuracy }: { signal: string; accuracy: number | null }) {
  const colors = {
    none: "text-destructive",
    weak: "text-yellow-500",
    good: "text-primary",
    excellent: "text-primary",
  };

  const bars = {
    none: 1,
    weak: 2,
    good: 3,
    excellent: 4,
  };

  return (
    <div className="flex items-center gap-1.5">
      <Signal size={12} className={colors[signal as keyof typeof colors]} />
      <div className="flex gap-0.5">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`w-1 rounded-full transition-all ${
              i <= bars[signal as keyof typeof bars]
                ? "bg-primary"
                : "bg-muted-foreground/30"
            }`}
            style={{ height: `${6 + i * 2}px` }}
          />
        ))}
      </div>
      {accuracy && (
        <span className="text-[10px] text-muted-foreground">
          {accuracy < 10 ? `${Math.round(accuracy)}m` : `${Math.round(accuracy)}m`}
        </span>
      )}
    </div>
  );
}

function PWAInstallHint() {
  const [show, setShow] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if app is already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isIOSStandalone = (window.navigator as any).standalone === true;
    setIsInstalled(isStandalone || isIOSStandalone);

    // Show hint only on mobile and not installed
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile && !isStandalone && !isIOSStandalone) {
      const dismissed = localStorage.getItem('pwa-hint-dismissed');
      if (!dismissed) {
        setShow(true);
      }
    }
  }, []);

  if (!show || isInstalled) return null;

  const dismiss = () => {
    localStorage.setItem('pwa-hint-dismissed', 'true');
    setShow(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-4 mb-4 flex items-start gap-3"
    >
      <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
        <Smartphone size={18} className="text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm">Instale o app</p>
        <p className="text-[11px] text-muted-foreground">
          Adicione o MultiFit na tela inicial para melhor experiência de rastreamento GPS.
        </p>
      </div>
      <button onClick={dismiss} className="text-xs text-muted-foreground hover:text-foreground">
        Fechar
      </button>
    </motion.div>
  );
}
