"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import {
  Camera,
  Upload,
  Link as LinkIcon,
  Sparkles,
  RefreshCw,
  AlertCircle,
  X,
} from "lucide-react";

export default function Home() {
  // Scraper State
  const [productUrl, setProductUrl] = useState("");
  const [isScraping, setIsScraping] = useState(false);
  const [scrapedImageUrl, setScrapedImageUrl] = useState("");
  const [scrapeError, setScrapeError] = useState("");
  const scrapePromiseRef = useRef<Promise<string | null> | null>(null);

  // User Image State
  const [uploadMode, setUploadMode] = useState<"upload" | "camera">("upload");
  const [userImage, setUserImage] = useState(""); // base64 or objectUrl
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");

  // Pipeline State
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultImage, setResultImage] = useState("");
  const [pipelineError, setPipelineError] = useState("");

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const resultRef = useRef<HTMLElement>(null);

  // Stop camera stream on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Handlers
  const executeScrape = async (url: string) => {
    setIsScraping(true);
    setScrapeError("");
    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to extract product image.");
      }

      setScrapedImageUrl(data.productImageUrl);
      return data.productImageUrl;
    } catch (err: any) {
      console.error(err);
      setScrapeError(err.message || "Unable to extract garment from this URL.");
      return null;
    } finally {
      setIsScraping(false);
    }
  };

  const handleBlurProductUrl = () => {
    if (productUrl && !scrapedImageUrl && !isScraping) {
      scrapePromiseRef.current = executeScrape(productUrl);
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProductUrl(e.target.value);
    setScrapedImageUrl(""); // Reset extraction if URL changes
    setScrapeError("");
  };

  const startCamera = async () => {
    setCameraError("");
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error("Camera access error:", err);
      setCameraError("Could not access camera. Please allow permission or upload a file.");
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // Mirror the image for intuitive selfie layout
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

        // Reset transform
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
        setUserImage(dataUrl);
        stopCamera();
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setUserImage(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const triggerTryOn = async () => {
    if (!userImage) {
      setPipelineError("Please upload or capture a photo of yourself.");
      return;
    }
    if (!productUrl) {
      setPipelineError("Please provide a product URL.");
      return;
    }

    setIsProcessing(true);
    setPipelineError("");
    setResultImage("");

    let finalScrapedUrl = scrapedImageUrl;

    if (!finalScrapedUrl) {
      if (isScraping && scrapePromiseRef.current) {
        // Wait for the background extraction to complete
        finalScrapedUrl = (await scrapePromiseRef.current) || "";
      } else {
        // If it wasn't triggered yet for some reason, run it now
        scrapePromiseRef.current = executeScrape(productUrl);
        finalScrapedUrl = (await scrapePromiseRef.current) || "";
      }
    }

    if (!finalScrapedUrl) {
      setPipelineError(scrapeError || "Failed to extract garment. Please check the URL.");
      setIsProcessing(false);
      return;
    }

    try {
      const response = await fetch("/api/try-on", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personImageBase64: userImage,
          productImageBase64: finalScrapedUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.details || data.error || "Generation failed.");
      }

      setResultImage(data.generatedImageBase64);

      // Scroll to result after a slight delay to allow rendering
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);

    } catch (err: any) {
      console.error(err);
      setPipelineError(err.message || "Virtual Try-On execution failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  const clearUserImage = () => {
    setUserImage("");
    stopCamera();
  };

  // Animation variants
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
  };

  return (
    <div className="flex-1 w-full max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8 flex flex-col justify-between font-sans">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex items-center justify-between pb-8 mb-12 border-b border-zinc-200"
      >
        <div className="flex items-center gap-2 group cursor-default">
          <motion.div
            whileHover={{ rotate: 180 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="w-6 h-6 bg-zinc-900 rounded-[6px] flex items-center justify-center shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </motion.div>
          <div className="flex flex-col">
            <span className="text-[15px] font-semibold tracking-tight text-zinc-900 leading-none">
              FitCheck.AI
            </span>
            <span className="text-[9px] font-mono text-zinc-400 tracking-wider uppercase mt-1 leading-none">
              by vijay dhyani
            </span>
          </div>
        </div>
        <div className="text-[11px] font-mono text-zinc-500 bg-zinc-100 px-2.5 py-1 rounded-md border border-zinc-200/60 flex items-center gap-2 uppercase tracking-wider">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
          System Online
        </div>
      </motion.header>

      {/* Hero Description */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
        className="max-w-2xl mb-12"
      >
        <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest font-semibold block mb-2">
          Virtual Fitting Room
        </span>
        <h1 className="text-3xl sm:text-4xl font-semibold text-zinc-900 tracking-tight mb-4">
          See how any clothing looks on you, instantly.
        </h1>
        <p className="text-zinc-500 text-sm sm:text-base leading-relaxed">
          Paste a product link from your favorite store and upload a photo of yourself.
        </p>
      </motion.div>

      <motion.main
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-10 items-start mb-16"
      >
        {/* Step 1: Product Input */}
        <motion.section variants={itemVariants} className="w-full flex flex-col gap-4 group">
          <label className="text-sm font-medium text-zinc-900 flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-zinc-100 border border-zinc-200 text-zinc-600 text-[11px] font-semibold font-mono transition-colors group-focus-within:bg-zinc-900 group-focus-within:text-white group-focus-within:border-zinc-900">1</span>
            Product Link
          </label>
          <div className="relative flex items-center shadow-sm rounded-lg overflow-hidden border border-zinc-200 focus-within:ring-2 focus-within:ring-zinc-900 focus-within:border-zinc-900 transition-all duration-300 bg-white hover:border-zinc-300">
            <div className="absolute left-3.5 text-zinc-400 group-focus-within:text-zinc-900 transition-colors duration-300">
              <LinkIcon className="w-4 h-4" />
            </div>
            <input
              type="text"
              placeholder="Paste URL from Amazon, Flipkart, Myntra..."
              value={productUrl}
              onChange={handleUrlChange}
              onBlur={handleBlurProductUrl}
              className="w-full pl-10 pr-4 py-3 text-[14px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none bg-transparent"
              disabled={isProcessing}
            />
          </div>
        </motion.section>

        {/* Step 2: Model Photo */}
        <motion.section variants={itemVariants} className="w-full flex flex-col gap-4 group">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-900 flex items-center gap-2">
              <span className={`flex items-center justify-center w-5 h-5 rounded-full border text-[11px] font-semibold font-mono transition-colors ${userImage ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-zinc-100 border-zinc-200 text-zinc-600'}`}>2</span>
              Model Photo
            </label>
            {userImage && (
              <button
                onClick={clearUserImage}
                className="text-[13px] text-zinc-500 hover:text-zinc-900 flex items-center gap-1 transition-colors"
              >
                <X className="w-3.5 h-3.5" /> Remove
              </button>
            )}
          </div>

          {!userImage ? (
            <div className="flex flex-col gap-4">
              {/* Selector Tabs */}
              <div className="flex p-[3px] rounded-lg bg-zinc-100/80 border border-zinc-200/60 w-fit">
                <button
                  onClick={() => {
                    setUploadMode("upload");
                    stopCamera();
                  }}
                  className={`relative px-4 py-1.5 rounded-md text-[13px] font-medium flex items-center gap-2 transition-all ${uploadMode === "upload"
                    ? "text-zinc-900"
                    : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50"
                    }`}
                >
                  {uploadMode === "upload" && (
                    <motion.div layoutId="activeTab" className="absolute inset-0 bg-white rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-zinc-200/50" />
                  )}
                  <span className="relative z-10 flex items-center gap-2"><Upload className="w-3.5 h-3.5" /> Upload File</span>
                </button>
                <button
                  onClick={() => {
                    setUploadMode("camera");
                    startCamera();
                  }}
                  className={`relative px-4 py-1.5 rounded-md text-[13px] font-medium flex items-center gap-2 transition-all ${uploadMode === "camera"
                    ? "text-zinc-900"
                    : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50"
                    }`}
                >
                  {uploadMode === "camera" && (
                    <motion.div layoutId="activeTab" className="absolute inset-0 bg-white rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-zinc-200/50" />
                  )}
                  <span className="relative z-10 flex items-center gap-2"><Camera className="w-3.5 h-3.5" /> Camera</span>
                </button>
              </div>

              {/* Upload Mode UI */}
              <AnimatePresence mode="wait">
                {uploadMode === "upload" && (
                  <motion.div
                    key="upload"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full sm:w-96 aspect-video bg-zinc-50 hover:bg-zinc-100 border border-dashed border-zinc-300 hover:border-zinc-400 rounded-xl flex flex-col items-center justify-center gap-3 cursor-pointer group transition-colors"
                  >
                    <motion.div whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 400 }}>
                      <Upload className="w-5 h-5 text-zinc-400 group-hover:text-zinc-600 transition-colors" />
                    </motion.div>
                    <div className="text-center">
                      <p className="text-[14px] font-medium text-zinc-700">Click to upload photo</p>
                      <p className="text-[12px] text-zinc-500 mt-1">JPEG or PNG (Max 5MB)</p>
                    </div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept="image/*"
                      className="hidden"
                    />
                  </motion.div>
                )}

                {/* Camera Mode UI */}
                {uploadMode === "camera" && (
                  <motion.div
                    key="camera"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                    className="relative w-full sm:w-96 aspect-video bg-zinc-100 border border-zinc-200 rounded-xl overflow-hidden flex flex-col"
                  >
                    {isCameraActive ? (
                      <>
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          className="absolute inset-0 w-full h-full object-cover -scale-x-100"
                        />
                        <div className="absolute inset-x-0 bottom-4 flex justify-center z-10">
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={capturePhoto}
                            className="px-5 py-2 bg-white/90 backdrop-blur-md border border-zinc-200/50 text-zinc-900 rounded-full text-[13px] font-semibold shadow-sm transition-all hover:bg-white"
                          >
                            Capture
                          </motion.button>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center flex-1 text-center p-6 gap-3 text-zinc-500">
                        <Camera className="w-6 h-6 animate-pulse text-zinc-400" />
                        {cameraError ? (
                          <p className="text-[13px] text-red-500 px-4">{cameraError}</p>
                        ) : (
                          <p className="text-[13px] text-zinc-500">Requesting camera permissions...</p>
                        )}
                        <button
                          onClick={startCamera}
                          className="mt-2 px-4 py-1.5 rounded-md border border-zinc-200 bg-white text-[12px] font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 transition-colors"
                        >
                          Retry Camera
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full sm:w-96 aspect-[3/4] sm:aspect-square bg-white border border-zinc-200 rounded-xl overflow-hidden p-2 shadow-sm relative group"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={userImage}
                alt="Model Snapshot"
                className="w-full h-full object-cover rounded-lg"
              />
              <div className="absolute inset-0 bg-zinc-900/0 group-hover:bg-zinc-900/5 transition-colors pointer-events-none rounded-lg" />
            </motion.div>
          )}
        </motion.section>

        {/* Global Action & Error */}
        <motion.div variants={itemVariants} className="w-full flex flex-col gap-4 mt-4">
          <motion.button
            whileHover={{ scale: (isProcessing || !productUrl || !userImage) ? 1 : 1.02 }}
            whileTap={{ scale: (isProcessing || !productUrl || !userImage) ? 1 : 0.98 }}
            onClick={triggerTryOn}
            disabled={isProcessing || !productUrl || !userImage}
            className="w-fit min-w-[200px] py-2.5 px-6 rounded-md font-medium text-[14px] bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors shadow-sm relative overflow-hidden"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              "Run Fitcheck AI"
            )}
          </motion.button>

          <AnimatePresence>
            {pipelineError && (
              <motion.div
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-3 w-fit rounded-lg bg-red-50 border border-red-100 text-[13px] text-red-600 flex items-start gap-2 shadow-sm mt-1">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                  <span>{pipelineError}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.main>

      {/* Result Section */}
      <AnimatePresence>
        {resultImage && (
          <motion.section
            ref={resultRef}
            initial={{ opacity: 0, y: 30, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="w-full flex flex-col gap-6 mb-16"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
              <h2 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-zinc-400" /> Fitting Result
              </h2>
              <button
                onClick={() => setResultImage("")}
                className="px-3 py-1.5 bg-white border border-zinc-200 hover:bg-zinc-50 text-[13px] font-medium text-zinc-700 rounded-md transition-colors shadow-sm active:bg-zinc-100"
              >
                Clear Result
              </button>
            </div>

            <div className="flex flex-col items-center">
              <motion.div
                whileHover={{ scale: 1.01 }}
                transition={{ type: "spring", stiffness: 300 }}
                className="relative w-full max-w-sm aspect-[3/4] bg-white border border-zinc-200 rounded-xl p-2 shadow-sm"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resultImage}
                  alt="Try On Result"
                  className="w-full h-full object-cover rounded-lg"
                />
              </motion.div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Processing Overlay Minimalistic */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-zinc-50/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              className="w-8 h-8 rounded-full border-[3px] border-zinc-200 border-t-zinc-900"
            />
            <p className="text-[14px] font-medium text-zinc-900">Applying garment seamlessly...</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="text-[12px] font-mono text-zinc-500 border-t border-zinc-200 pt-8 mt-auto flex flex-col sm:flex-row items-center justify-between gap-4"
      >
        <span>FitCheck.AI by <a href="https://dhyani.site" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-900 transition-colors">Vijay Dhyani</a> &copy; {new Date().getFullYear()}</span>
        <div className="flex items-center gap-6">
          <a href="#" className="hover:text-zinc-900 transition-colors">Privacy</a>
          <a href="#" className="hover:text-zinc-900 transition-colors">Terms</a>
        </div>
      </motion.footer>
    </div>
  );
}
