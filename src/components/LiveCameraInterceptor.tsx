"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { type Incident, type InterceptedCamera } from "@/lib/types";
import { useSimulationStore } from "@/lib/store";
import { 
    Video, 
    Radio, 
    Compass, 
    MapPin, 
    Sparkles, 
    RefreshCw, 
    Maximize2, 
    ShieldAlert, 
    Activity, 
    Layers,
    ExternalLink,
    Camera,
    Play,
    Globe
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LiveCameraInterceptorProps {
    incident?: Incident | null;
    className?: string;
    onClose?: () => void;
}

export function LiveCameraInterceptor({ incident, className, onClose }: LiveCameraInterceptorProps) {
    const { focusedIncidentId, incidents, activeMapCenter, showNotification } = useSimulationStore();
    const activeIncident = incident || incidents.find(i => i.id === focusedIncidentId) || (incidents.length > 0 ? incidents[0] : null);
    const targetLat = activeIncident?.location?.lat || activeMapCenter?.lat || 22.0797;
    const targetLng = activeIncident?.location?.lng || activeMapCenter?.lng || 82.1409;
    const incidentId = activeIncident?.id || "REGIONAL-MONITOR";

    const [cameras, setCameras] = useState<InterceptedCamera[]>([]);
    const [selectedCamera, setSelectedCamera] = useState<InterceptedCamera | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [activeFilter, setActiveFilter] = useState<"ALL" | "WINDY" | "MUNICIPAL">("ALL");
    const [windyViewMode, setWindyViewMode] = useState<"PLAYER" | "SNAPSHOT">("PLAYER");
    const [hasWindyAccess, setHasWindyAccess] = useState<boolean>(true);
    const [analysisResult, setAnalysisResult] = useState<{
        flood?: string;
        damage?: string;
        people?: string;
        trace?: string;
    } | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);

    // Fetch nearby and regional cameras whenever the active target changes
    useEffect(() => {
        let isMounted = true;
        const fetchNearbyCameras = async () => {
            setIsLoading(true);
            setAnalysisResult(null);
            try {
                const res = await fetch(
                    `/api/surveillance/nearby-camera?lat=${targetLat}&lng=${targetLng}&radius_km=30&incident_id=${incidentId}`
                );
                if (res.ok) {
                    const data = await res.json();
                    if (isMounted) {
                        const fetchedCams: InterceptedCamera[] = data.nearby_cameras || [];
                        setCameras(fetchedCams);
                        setHasWindyAccess(!!data.has_windy_access);
                        setSelectedCamera(data.primary_camera || (fetchedCams.length > 0 ? fetchedCams[0] : null));
                    }
                }
            } catch (err) {
                console.error("[CAMERA-INTERCEPTOR] Error fetching cameras:", err);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        fetchNearbyCameras();

        return () => {
            isMounted = false;
        };
    }, [targetLat, targetLng, incidentId]);

    // Counts for filter badges
    const windyCount = useMemo(() => cameras.filter(c => c.source === "WINDY").length, [cameras]);
    const municipalCount = useMemo(() => cameras.filter(c => c.source === "MUNICIPAL_CCTV").length, [cameras]);

    const filteredCameras = useMemo(() => {
        if (activeFilter === "WINDY") return cameras.filter(c => c.source === "WINDY");
        if (activeFilter === "MUNICIPAL") return cameras.filter(c => c.source === "MUNICIPAL_CCTV");
        return cameras;
    }, [cameras, activeFilter]);

    // Perform AI analysis on the currently intercepted camera stream
    const handleAnalyzeStream = async () => {
        if (!selectedCamera || isAnalyzing) return;
        setIsAnalyzing(true);
        showNotification("Dispatching Gemini 3 Vision to scan camera intercept...", "info");

        try {
            const { analyzeSurveillance } = await import("@/agents/surveillance");
            const mockOrActive = {
                id: activeIncident?.id || selectedCamera.id,
                title: (activeIncident as any)?.title || activeIncident?.category || selectedCamera.title,
                type: "VIDEO",
                priority: activeIncident?.priority || "HIGH",
                status: activeIncident?.status || "ACTIVE",
                location: activeIncident?.location || selectedCamera.location,
                source: "SURVEILLANCE_AGENT",
                created_at: new Date().toISOString(),
                description: selectedCamera.title
            };

            const result = await analyzeSurveillance({
                ...mockOrActive,
                type: "VIDEO",
                raw_input: selectedCamera.preview_image_url || selectedCamera.stream_url,
                mission_context: `[LIVE INTERCEPT]: Analyzing feed from ${selectedCamera.title} (${selectedCamera.operator}), located ${selectedCamera.distance_km}km ${selectedCamera.bearing} of observation center.`
            } as any);

            setAnalysisResult({
                flood: result.flood_level || "Assessed",
                damage: result.structural_damage || "Assessed",
                people: result.people_safety || "Monitoring",
                trace: result.reasoning_trace || "Visual verification completed."
            });

            showNotification("Camera feed verified by Gemini 3 Pro Vision", "success");
        } catch (err: any) {
            console.error("[CAMERA-INTERCEPTOR] Analysis error:", err);
            showNotification("Vision analysis failed. Check console.", "error");
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className={cn("glass-panel rounded-xl flex flex-col overflow-hidden relative border border-cyan-500/30 bg-zinc-950/90 backdrop-blur-xl shadow-2xl", className)}>
            {/* Header */}
            <div className="h-10 border-b border-white/10 bg-white/5 px-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                    <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                    <span className="text-[11px] font-mono tracking-widest uppercase font-bold text-cyan-300">
                        GOD&apos;S EYE // CAMERA INTERCEPTOR
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-cyan-950/80 text-cyan-400 font-mono border border-cyan-500/30">
                        {cameras.length} FEED{cameras.length !== 1 ? "S" : ""} ACTIVE
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="text-zinc-400 hover:text-white font-mono text-xs px-2 py-0.5 rounded hover:bg-white/10 cursor-pointer"
                        >
                            ✕
                        </button>
                    )}
                </div>
            </div>

            {/* Filter Tabs (All / Windy / Municipal) */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5 bg-zinc-900/60 shrink-0 text-[10px] font-mono">
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setActiveFilter("ALL")}
                        className={cn(
                            "px-2 py-0.5 rounded font-bold transition-all cursor-pointer",
                            activeFilter === "ALL"
                                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/50"
                                : "text-zinc-400 hover:text-zinc-200"
                        )}
                    >
                        ALL ({cameras.length})
                    </button>
                    <button
                        onClick={() => setActiveFilter("WINDY")}
                        className={cn(
                            "px-2 py-0.5 rounded font-bold transition-all flex items-center gap-1 cursor-pointer",
                            activeFilter === "WINDY"
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/50"
                                : "text-zinc-400 hover:text-zinc-200"
                        )}
                        title="Windy Open Public Webcams API"
                    >
                        <span>🌪️</span>
                        <span>WINDY ({windyCount})</span>
                    </button>
                    <button
                        onClick={() => setActiveFilter("MUNICIPAL")}
                        className={cn(
                            "px-2 py-0.5 rounded font-bold transition-all flex items-center gap-1 cursor-pointer",
                            activeFilter === "MUNICIPAL"
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/50"
                                : "text-zinc-400 hover:text-zinc-200"
                        )}
                        title="Municipal Traffic & Disaster CCTV"
                    >
                        <span>🏢</span>
                        <span>MUNICIPAL ({municipalCount})</span>
                    </button>
                </div>

                {/* Windy Player Mode Toggle */}
                {selectedCamera?.source === "WINDY" && (
                    <div className="flex items-center bg-black/60 rounded border border-white/10 p-0.5">
                        <button
                            onClick={() => setWindyViewMode("PLAYER")}
                            className={cn(
                                "px-1.5 py-0.5 rounded text-[9px] font-mono transition-all cursor-pointer flex items-center gap-1",
                                windyViewMode === "PLAYER"
                                    ? "bg-amber-500/30 text-amber-300 font-bold"
                                    : "text-zinc-400 hover:text-zinc-200"
                            )}
                            title="Interactive Daylight/Day Timelapse Player"
                        >
                            <Play className="w-2.5 h-2.5" />
                            <span>TIMELAPSE</span>
                        </button>
                        <button
                            onClick={() => setWindyViewMode("SNAPSHOT")}
                            className={cn(
                                "px-1.5 py-0.5 rounded text-[9px] font-mono transition-all cursor-pointer flex items-center gap-1",
                                windyViewMode === "SNAPSHOT"
                                    ? "bg-cyan-500/30 text-cyan-300 font-bold"
                                    : "text-zinc-400 hover:text-zinc-200"
                            )}
                            title="High-Resolution Realtime Snapshot"
                        >
                            <Camera className="w-2.5 h-2.5" />
                            <span>SNAPSHOT</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Camera Switcher Horizontal Strip */}
            {filteredCameras.length > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-white/5 bg-black/40 overflow-x-auto tactical-scrollbar shrink-0">
                    {filteredCameras.map((cam) => {
                        const isSelected = selectedCamera?.id === cam.id;
                        const isWindy = cam.source === "WINDY";
                        return (
                            <button
                                key={cam.id}
                                onClick={() => {
                                    setSelectedCamera(cam);
                                    setAnalysisResult(null);
                                }}
                                className={cn(
                                    "flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-mono whitespace-nowrap transition-all border cursor-pointer",
                                    isSelected
                                        ? isWindy
                                            ? "bg-amber-500/20 border-amber-400/60 text-amber-200 shadow-[0_0_10px_rgba(245,158,11,0.3)]"
                                            : "bg-cyan-500/20 border-cyan-400/60 text-cyan-200 shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                                        : "bg-zinc-900/60 border-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                                )}
                            >
                                <span className={cn(
                                    "w-1.5 h-1.5 rounded-full shrink-0",
                                    isSelected ? (isWindy ? "bg-amber-400 animate-ping" : "bg-cyan-400 animate-ping") : "bg-zinc-600"
                                )} />
                                <span>{isWindy ? "🌪️" : "📹"}</span>
                                <span className="font-bold">{cam.location.address?.split(",")[0] || cam.id}</span>
                                <span className="text-zinc-500 text-[9px]">({cam.distance_km}km)</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Video / Stream Viewport */}
            <div className="relative flex-1 min-h-[260px] max-h-[360px] bg-black flex items-center justify-center overflow-hidden group">
                {isLoading ? (
                    <div className="flex flex-col items-center gap-2 text-cyan-400 font-mono text-xs animate-pulse">
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        <span>INTERCEPTING OPTICAL TELEMETRY...</span>
                    </div>
                ) : selectedCamera ? (
                    <>
                        {/* 1. Windy Embed Iframe Player */}
                        {selectedCamera.source === "WINDY" && windyViewMode === "PLAYER" && selectedCamera.stream_url.startsWith("http") ? (
                            <iframe
                                src={selectedCamera.stream_url}
                                title={selectedCamera.title}
                                className="w-full h-full border-0 bg-black min-h-[260px]"
                                allow="autoplay; fullscreen"
                                loading="lazy"
                            />
                        ) : selectedCamera.stream_type === "IMAGE_SNAPSHOT" || (selectedCamera.source === "WINDY" && windyViewMode === "SNAPSHOT") ? (
                            /* 2. Real-time Snapshot Image */
                            <div className="relative w-full h-full flex items-center justify-center bg-black">
                                <img
                                    src={selectedCamera.preview_image_url || selectedCamera.stream_url}
                                    alt={selectedCamera.title}
                                    className="w-full h-full object-contain"
                                />
                            </div>
                        ) : (
                            /* 3. MP4 / Local Video Stream */
                            <video
                                ref={videoRef}
                                src={selectedCamera.stream_url}
                                autoPlay
                                loop
                                muted
                                playsInline
                                className="w-full h-full object-cover"
                            />
                        )}

                        {/* Tactical Scanline & Vignette Overlay */}
                        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(0,0,0,0.7)_100%)]" />
                        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.15)_50%)] bg-[length:100%_4px] opacity-30" />

                        {/* Top Left Live Badge & Timestamp */}
                        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10 pointer-events-none">
                            <span className={cn(
                                "flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[9px] font-bold tracking-wider animate-pulse border shadow-md",
                                selectedCamera.source === "WINDY"
                                    ? "bg-amber-950/80 border-amber-500/50 text-amber-300"
                                    : "bg-red-950/80 border-red-500/50 text-red-400"
                            )}>
                                <span className={cn("w-1.5 h-1.5 rounded-full", selectedCamera.source === "WINDY" ? "bg-amber-400" : "bg-red-400")} />
                                {selectedCamera.source === "WINDY" ? "WINDY LIVE" : "LIVE INTERCEPT"}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-black/80 border border-white/10 text-zinc-300 font-mono text-[9px]">
                                {selectedCamera.source}
                            </span>
                        </div>

                        {/* Top Right Distance & Bearing Overlay */}
                        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10 pointer-events-none">
                            <div className="px-2.5 py-0.5 rounded bg-black/80 border border-cyan-500/40 text-cyan-300 font-mono text-[10px] flex items-center gap-1 shadow-lg">
                                <Compass className="w-3 h-3 text-cyan-400" />
                                <span>{selectedCamera.distance_km} KM // {selectedCamera.bearing}</span>
                            </div>
                        </div>

                        {/* Bottom Overlay: Camera Identity */}
                        <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col gap-1 z-10">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold text-white font-mono tracking-wide truncate max-w-[70%]">
                                    {selectedCamera.title}
                                </h4>
                                <span className="text-[9px] font-mono text-zinc-400">
                                    {selectedCamera.location.address || `${selectedCamera.location.lat.toFixed(4)}, ${selectedCamera.location.lng.toFixed(4)}`}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                                <span className="text-zinc-500 truncate max-w-[60%]">
                                    OPERATOR: {selectedCamera.operator}
                                </span>
                                <div className="flex items-center gap-2">
                                    <span className="text-emerald-400 font-semibold">{selectedCamera.last_updated}</span>
                                    {selectedCamera.source === "WINDY" && (
                                        <a
                                            href={`https://windy.com/webcams/${selectedCamera.id.replace("WINDY-", "")}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-amber-400 hover:text-amber-300 flex items-center gap-1 underline text-[9px]"
                                            title="View full webcam page on Windy.com"
                                        >
                                            <ExternalLink className="w-2.5 h-2.5" />
                                            <span>Windy</span>
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="text-zinc-500 font-mono text-xs">
                        NO OPTICAL STREAM DETECTED
                    </div>
                )}
            </div>

            {/* AI Vision Action Bar */}
            <div className="p-3 bg-zinc-900/90 border-t border-white/10 flex flex-col gap-2 shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Activity className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[10px] font-mono uppercase text-zinc-400 font-bold">
                            SURVEILLANCE AGENT INTEGRATION
                        </span>
                    </div>

                    <button
                        onClick={handleAnalyzeStream}
                        disabled={isAnalyzing || !selectedCamera}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-[10px] font-bold tracking-wider transition-all border shadow-sm cursor-pointer",
                            isAnalyzing
                                ? "bg-cyan-950/40 border-cyan-500/50 text-cyan-300 animate-pulse"
                                : "bg-gradient-to-r from-emerald-950/60 to-cyan-950/60 border-emerald-500/40 text-emerald-300 hover:border-emerald-400 hover:text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
                        )}
                    >
                        {isAnalyzing ? (
                            <>
                                <RefreshCw className="w-3 h-3 animate-spin text-cyan-400" />
                                <span>AI AUDITING STREAM...</span>
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-3 h-3 text-emerald-400" />
                                <span>ANALYZE WITH GEMINI 3 VISION</span>
                            </>
                        )}
                    </button>
                </div>

                {/* AI Analysis Result Card */}
                {analysisResult && (
                    <div className="p-2.5 rounded-lg bg-black/60 border border-emerald-500/30 font-mono text-[10px] flex flex-col gap-1.5 animate-fadeIn">
                        <div className="flex items-center justify-between text-zinc-400 border-b border-white/5 pb-1">
                            <span className="text-emerald-400 font-bold">✓ OPTICAL AUDIT COMPLETE</span>
                            <span className="text-zinc-500">GEMINI 3 PRO // 2S FRAME SAMPLE</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-zinc-300">
                            <div>
                                <span className="text-zinc-500">FLOOD HAZARD: </span>
                                <span className="text-cyan-300 font-bold">{analysisResult.flood}</span>
                            </div>
                            <div>
                                <span className="text-zinc-500">STRUCTURAL RISK: </span>
                                <span className="text-amber-300 font-bold">{analysisResult.damage}</span>
                            </div>
                        </div>
                        {analysisResult.trace && (
                            <p className="text-zinc-400 italic text-[9px] line-clamp-2 mt-0.5">
                                &ldquo;{analysisResult.trace}&rdquo;
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default LiveCameraInterceptor;
