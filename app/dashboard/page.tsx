"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  RefreshCw,
  Lock,
  AlertCircle,
  X,
  Eye,
  Activity,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ChevronLeft,
} from "lucide-react";
import Link from "next/link";

interface StatsEntry {
  id: string;
  timestamp: string;
  garmentMode: "link" | "upload" | "camera";
  productUrl?: string;
  status: "success" | "failed";
  error?: string | null;
}

interface EntryDetails {
  userImage: string | null;
  garmentImage: string | null;
  resultImage: string | null;
}

export default function Dashboard() {
  const [passcode, setPasscode] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Data States
  const [stats, setStats] = useState<StatsEntry[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [statsError, setStatsError] = useState("");

  // Inspect Modal State
  const [inspectItem, setInspectItem] = useState<StatsEntry | null>(null);
  const [inspectDetails, setInspectDetails] = useState<EntryDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState("");

  // Check session storage on load
  useEffect(() => {
    const savedPasscode = sessionStorage.getItem("dashboard_passcode");
    if (savedPasscode) {
      loadStats(savedPasscode);
    }
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode) return;
    setLoginError("");
    setIsLoggingIn(true);
    await loadStats(passcode);
    setIsLoggingIn(false);
  };

  const loadStats = async (codeToTry: string) => {
    setIsLoadingStats(true);
    setStatsError("");
    try {
      const res = await fetch("/api/dashboard/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: codeToTry }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load stats.");
      }

      setStats(data.stats);
      setIsAuthenticated(true);
      sessionStorage.setItem("dashboard_passcode", codeToTry);
      setPasscode(codeToTry); // sync state
    } catch (err: any) {
      setLoginError(err.message || "Failed to authenticate.");
      sessionStorage.removeItem("dashboard_passcode");
    } finally {
      setIsLoadingStats(false);
    }
  };

  const handleInspect = async (item: StatsEntry) => {
    setInspectItem(item);
    setInspectDetails(null);
    setIsLoadingDetails(true);
    setDetailsError("");

    try {
      const res = await fetch("/api/dashboard/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode, id: item.id }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load entry details.");
      }

      setInspectDetails(data);
    } catch (err: any) {
      setDetailsError(err.message || "Unable to retrieve images for this try-on.");
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("dashboard_passcode");
    setPasscode("");
    setIsAuthenticated(false);
    setStats([]);
  };

  // Helper Stats Calculations
  const totalTries = stats.length;
  const successfulTries = stats.filter((s) => s.status === "success").length;
  const failedTries = totalTries - successfulTries;
  const successRate = totalTries > 0 ? Math.round((successfulTries / totalTries) * 100) : 0;

  const modeDistribution = stats.reduce(
    (acc, curr) => {
      acc[curr.garmentMode] = (acc[curr.garmentMode] || 0) + 1;
      return acc;
    },
    { link: 0, upload: 0, camera: 0 } as Record<string, number>
  );

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="flex-1 w-full max-w-5xl mx-auto px-4 py-12 sm:px-6 lg:px-8 flex flex-col font-sans">
      
      {/* 1. Login View */}
      <AnimatePresence mode="wait">
        {!isAuthenticated ? (
          <motion.div
            key="login"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex-1 flex flex-col items-center justify-center py-20"
          >
            <div className="w-full max-w-md bg-white border border-zinc-200 rounded-2xl shadow-xl p-8">
              <div className="flex flex-col items-center text-center mb-8">
                <div className="w-12 h-12 bg-zinc-900 rounded-xl flex items-center justify-center text-white mb-4 shadow-sm">
                  <Lock className="w-5 h-5" />
                </div>
                <h1 className="text-2xl font-semibold text-zinc-950">Dashboard Security</h1>
                <p className="text-zinc-500 text-sm mt-2">
                  Enter the dashboard passcode configured in your environment to view system analytics.
                </p>
              </div>

              <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4">
                <div className="relative">
                  <input
                    type="password"
                    placeholder="Enter passcode"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:border-zinc-950 text-center text-zinc-900 font-mono tracking-widest"
                    required
                  />
                </div>

                {loginError && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-red-50 border border-red-100 rounded-lg text-[13px] text-red-600 flex items-start gap-2"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{loginError}</span>
                  </motion.div>
                )}

                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full py-3 bg-zinc-950 hover:bg-zinc-800 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
                >
                  {isLoggingIn ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    "Verify & Access"
                  )}
                </button>
              </form>
            </div>
          </motion.div>
        ) : (
          /* 2. Main Dashboard View */
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 flex flex-col gap-8"
          >
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 pb-6">
              <div className="flex flex-col gap-2">
                <Link
                  href="/"
                  className="text-xs text-zinc-500 hover:text-zinc-900 flex items-center gap-1 transition-colors w-fit"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Back to Try-On App
                </Link>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-zinc-950 rounded-[6px] flex items-center justify-center text-white">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <h1 className="text-xl font-semibold text-zinc-950">FitCheck.AI Dashboard</h1>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => loadStats(passcode)}
                  disabled={isLoadingStats}
                  className="p-2 border border-zinc-200 hover:bg-zinc-50 rounded-lg transition-colors text-zinc-600 disabled:opacity-50"
                  title="Reload Stats"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoadingStats ? "animate-spin" : ""}`} />
                </button>
                <button
                  onClick={handleLogout}
                  className="px-3 py-1.5 border border-zinc-200 hover:bg-zinc-50 text-zinc-600 hover:text-zinc-900 rounded-lg text-[13px] font-medium transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>

            {/* Analytics Stats Widgets */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <motion.div
                whileHover={{ y: -2 }}
                className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm flex flex-col justify-between h-28"
              >
                <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">Total Attempts</span>
                <span className="text-3xl font-semibold text-zinc-950 font-mono">{totalTries}</span>
              </motion.div>
              <motion.div
                whileHover={{ y: -2 }}
                className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm flex flex-col justify-between h-28"
              >
                <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">Success Rate</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold text-zinc-950 font-mono">{successRate}%</span>
                  <span className="text-[11px] text-emerald-600 font-mono">({successfulTries} successes)</span>
                </div>
              </motion.div>
              <motion.div
                whileHover={{ y: -2 }}
                className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm flex flex-col justify-between h-28"
              >
                <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">Failed Runs</span>
                <span className="text-3xl font-semibold text-red-500 font-mono">{failedTries}</span>
              </motion.div>
              <motion.div
                whileHover={{ y: -2 }}
                className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm flex flex-col justify-between h-28"
              >
                <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">Source Split</span>
                <div className="flex items-center gap-3 text-zinc-700 text-xs font-mono">
                  <span title="Link mode">🔗 {modeDistribution.link}</span>
                  <span title="Upload mode">📁 {modeDistribution.upload}</span>
                  <span title="Camera mode">📸 {modeDistribution.camera}</span>
                </div>
              </motion.div>
            </div>

            {/* Stats Table / List */}
            <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden flex-1">
              <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
                <h3 className="font-medium text-zinc-900 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-zinc-400" /> System Activities
                </h3>
                <span className="text-[11px] font-mono text-zinc-400">Showing last {totalTries} try-ons</span>
              </div>

              {totalTries === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-zinc-500">
                  <AlertCircle className="w-8 h-8 text-zinc-300 animate-pulse mb-3" />
                  <p className="text-sm font-medium">No system records found.</p>
                  <p className="text-xs text-zinc-400 mt-1">Try generating a Try-On on the main page.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-zinc-50 text-[11px] font-mono text-zinc-400 uppercase tracking-wider border-b border-zinc-200">
                        <th className="px-6 py-3 font-medium">Time</th>
                        <th className="px-6 py-3 font-medium">Try-On ID</th>
                        <th className="px-6 py-3 font-medium">Garment Mode</th>
                        <th className="px-6 py-3 font-medium">Status</th>
                        <th className="px-6 py-3 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 text-zinc-700">
                      {stats.map((item) => (
                        <tr
                          key={item.id}
                          className="hover:bg-zinc-50 transition-colors group cursor-pointer"
                          onClick={() => handleInspect(item)}
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-zinc-900 font-medium">
                            {formatDate(item.timestamp)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-zinc-500">
                            {item.id}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium font-mono uppercase bg-zinc-100 text-zinc-800 border border-zinc-200/60">
                              {item.garmentMode === "link" ? "🔗 link" : item.garmentMode === "camera" ? "📸 camera" : "📁 upload"}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {item.status === "success" ? (
                              <span className="inline-flex items-center gap-1 text-[12px] text-emerald-600 font-medium font-mono">
                                <CheckCircle2 className="w-3.5 h-3.5" /> success
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 text-[12px] text-red-600 font-medium font-mono"
                                title={item.error || "Generation error"}
                              >
                                <XCircle className="w-3.5 h-3.5" /> failed
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleInspect(item);
                              }}
                              className="p-1.5 rounded-lg border border-zinc-200 bg-white group-hover:bg-zinc-950 group-hover:text-white transition-all shadow-sm"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 3. Detail Drawer Modal */}
            <AnimatePresence>
              {inspectItem && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-end"
                  onClick={() => setInspectItem(null)}
                >
                  <motion.div
                    initial={{ x: "100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "100%" }}
                    transition={{ type: "spring", damping: 30, stiffness: 300 }}
                    className="w-full max-w-2xl h-full bg-zinc-50 border-l border-zinc-200 shadow-2xl flex flex-col p-6 overflow-y-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-zinc-200 pb-4 mb-6">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest font-semibold">Try-On Record Details</span>
                        <h2 className="text-base font-semibold text-zinc-950 font-mono">{inspectItem.id}</h2>
                      </div>
                      <button
                        onClick={() => setInspectItem(null)}
                        className="p-2 border border-zinc-200 bg-white hover:bg-zinc-50 rounded-lg text-zinc-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Metadata summary */}
                    <div className="bg-white border border-zinc-200 rounded-xl p-4 flex flex-col gap-3 text-sm mb-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[11px] font-mono uppercase text-zinc-400">Timestamp</p>
                          <p className="font-medium text-zinc-850 mt-0.5">{formatDate(inspectItem.timestamp)}</p>
                        </div>
                        <div>
                          <p className="text-[11px] font-mono uppercase text-zinc-400">Garment Source Mode</p>
                          <p className="font-medium text-zinc-850 capitalize mt-0.5">{inspectItem.garmentMode}</p>
                        </div>
                      </div>

                      {inspectItem.garmentMode === "link" && inspectItem.productUrl && (
                        <div className="border-t border-zinc-100 pt-3">
                          <p className="text-[11px] font-mono uppercase text-zinc-400">Source Product URL</p>
                          <a
                            href={inspectItem.productUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-zinc-800 hover:text-zinc-950 font-medium flex items-center gap-1 hover:underline mt-1 break-all text-xs"
                          >
                            {inspectItem.productUrl} <ExternalLink className="w-3.5 h-3.5 inline shrink-0" />
                          </a>
                        </div>
                      )}

                      {inspectItem.status === "failed" && (
                        <div className="border-t border-zinc-100 pt-3 text-red-600">
                          <p className="text-[11px] font-mono uppercase text-red-400">Failure Details</p>
                          <p className="mt-1 font-mono text-xs bg-red-50 p-2.5 border border-red-100 rounded-md">
                            {inspectItem.error || "Unknown generation failure."}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Images Rendering Grid */}
                    <div className="flex-1 flex flex-col gap-6">
                      <h4 className="text-xs font-semibold text-zinc-900 uppercase font-mono tracking-wider">Visual Assets</h4>

                      {isLoadingDetails ? (
                        <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
                          <RefreshCw className="w-8 h-8 text-zinc-400 animate-spin" />
                          <p className="text-sm font-medium text-zinc-500 font-mono">Retrieving secure GCS images...</p>
                        </div>
                      ) : detailsError ? (
                        <div className="p-4 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600 flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>{detailsError}</span>
                        </div>
                      ) : inspectDetails ? (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                          
                          {/* Garment Image */}
                          <div className="flex flex-col gap-2">
                            <span className="text-[10px] font-mono uppercase text-zinc-500 font-semibold text-center">Garment Image</span>
                            <div className="aspect-[3/4] bg-white border border-zinc-200 rounded-xl p-2 shadow-sm flex items-center justify-center overflow-hidden">
                              {inspectDetails.garmentImage ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={inspectDetails.garmentImage}
                                  alt="Garment Source"
                                  className="w-full h-full object-contain rounded-lg"
                                />
                              ) : (
                                <span className="text-[11px] text-zinc-400 font-mono">Not Found</span>
                              )}
                            </div>
                          </div>

                          {/* User Photo */}
                          <div className="flex flex-col gap-2">
                            <span className="text-[10px] font-mono uppercase text-zinc-500 font-semibold text-center">Your Photo</span>
                            <div className="aspect-[3/4] bg-white border border-zinc-200 rounded-xl p-2 shadow-sm flex items-center justify-center overflow-hidden">
                              {inspectDetails.userImage ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={inspectDetails.userImage}
                                  alt="User Target"
                                  className="w-full h-full object-cover rounded-lg"
                                />
                              ) : (
                                <span className="text-[11px] text-zinc-400 font-mono">Not Found</span>
                              )}
                            </div>
                          </div>

                          {/* Try On Result */}
                          <div className="flex flex-col gap-2">
                            <span className="text-[10px] font-mono uppercase text-zinc-500 font-semibold text-center">Generated Result</span>
                            <div className="aspect-[3/4] bg-white border border-zinc-200 rounded-xl p-2 shadow-sm flex items-center justify-center overflow-hidden">
                              {inspectItem.status === "success" && inspectDetails.resultImage ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={inspectDetails.resultImage}
                                  alt="AI Result"
                                  className="w-full h-full object-cover rounded-lg"
                                />
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-100 rounded-lg border border-dashed border-zinc-200 text-zinc-400 gap-1.5 p-3 text-center">
                                  <XCircle className="w-5 h-5 text-red-400" />
                                  <span className="text-[10px] font-mono leading-tight">No Output (Failed Run)</span>
                                </div>
                              )}
                            </div>
                          </div>

                        </div>
                      ) : null}
                    </div>

                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
