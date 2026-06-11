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
  Download,
  Clipboard,
  Shirt,
} from "lucide-react";

export default function Home() {
  // Scraper State
  const [productUrl, setProductUrl] = useState("");
  const [isScraping, setIsScraping] = useState(false);
  const [scrapedImageUrl, setScrapedImageUrl] = useState("");
  const [scrapeError, setScrapeError] = useState("");
  const [suggestedImages, setSuggestedImages] = useState<{ url: string; title: string; thumbnail: string }[]>([]);
  const [isSearchingImages, setIsSearchingImages] = useState(false);
  const scrapePromiseRef = useRef<Promise<string | null> | null>(null);

  // Garment Mode State
  const [garmentMode, setGarmentMode] = useState<"link" | "upload" | "camera">("link");
  const [garmentType, setGarmentType] = useState<"auto" | "tops" | "bottoms" | "dress">("auto");
  const garmentFileInputRef = useRef<HTMLInputElement>(null);
  const [isGarmentCameraActive, setIsGarmentCameraActive] = useState(false);
  const [garmentCameraError, setGarmentCameraError] = useState("");
  const garmentVideoRef = useRef<HTMLVideoElement>(null);
  const garmentStreamRef = useRef<MediaStream | null>(null);

  // User Image State
  const [uploadMode, setUploadMode] = useState<"upload" | "camera">("upload");
  const [userImage, setUserImage] = useState(""); // base64 or objectUrl
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");

  // Pipeline State
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultImage, setResultImage] = useState("");
  const [pipelineError, setPipelineError] = useState("");

  // Loading progress status state
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingPhase, setLoadingPhase] = useState("");

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const resultRef = useRef<HTMLElement>(null);

  // Stop camera stream on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      stopGarmentCamera();
    };
  }, []);

  // Animate loading progress asymptotically while backend call is active
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isProcessing) {
      setLoadingProgress(0);
      interval = setInterval(() => {
        setLoadingProgress((prev) => {
          if (prev >= 98) return prev;
          // Asymptotically slow down as it gets closer to 99%
          const increment = Math.max(1, Math.floor((100 - prev) / 12));
          return prev + increment;
        });
      }, 700);
    } else {
      setLoadingProgress(0);
    }
    return () => clearInterval(interval);
  }, [isProcessing]);

  // Map progress percentage to human-friendly rendering phases
  useEffect(() => {
    if (loadingProgress < 15) {
      setLoadingPhase("Analyzing garment structure...");
    } else if (loadingProgress < 35) {
      setLoadingPhase("Detecting body keypoints & posture...");
    } else if (loadingProgress < 55) {
      setLoadingPhase("Calculating fabric drape & seams...");
    } else if (loadingProgress < 75) {
      setLoadingPhase("Synthesizing textures and folds...");
    } else if (loadingProgress < 92) {
      setLoadingPhase("Matching lighting & global shadows...");
    } else {
      setLoadingPhase("Generating final high-res output...");
    }
  }, [loadingProgress]);

  // Handlers
  const executeScrape = async (url: string) => {
    setIsScraping(true);
    setScrapeError("");
    setSuggestedImages([]);
    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      let data: any = {};
      const responseText = await response.text();
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        data = { error: responseText || `HTTP Error ${response.status}: ${response.statusText}` };
      }

      if (!response.ok) {
        throw new Error(data.error || `Failed to extract product image: ${response.statusText || response.status}`);
      }

      setScrapedImageUrl(data.productImageUrl);
      return data.productImageUrl;
    } catch (err: any) {
      console.error(err);
      setScrapeError(err.message || "Unable to extract garment from this URL.");
      triggerImageSearch(url);
      return null;
    } finally {
      setIsScraping(false);
    }
  };

  const triggerImageSearch = async (query: string) => {
    setIsSearchingImages(true);
    setSuggestedImages([]);
    try {
      const response = await fetch("/api/image-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await response.json();
      if (data.images && data.images.length > 0) {
        setSuggestedImages(data.images);
      }
    } catch (err) {
      console.error("Image search fallback failed:", err);
    } finally {
      setIsSearchingImages(false);
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
    setSuggestedImages([]);
  };

  const handlePasteProductUrl = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const trimmedText = text.trim();
        setProductUrl(trimmedText);
        setScrapedImageUrl("");
        setScrapeError("");
        setSuggestedImages([]);
        scrapePromiseRef.current = executeScrape(trimmedText);
      }
    } catch (err) {
      console.error("Failed to read clipboard: ", err);
    }
  };

  const handleClearProductUrl = () => {
    setProductUrl("");
    setScrapedImageUrl("");
    setScrapeError("");
    setSuggestedImages([]);
  };

  const startCamera = async () => {
    stopGarmentCamera();
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

  const startGarmentCamera = async () => {
    stopCamera();
    setGarmentCameraError("");
    setIsGarmentCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });
      garmentStreamRef.current = stream;
      if (garmentVideoRef.current) {
        garmentVideoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error("Garment camera access error:", err);
      setGarmentCameraError("Could not access camera. Please allow permission or upload a file.");
      setIsGarmentCameraActive(false);
    }
  };

  const stopGarmentCamera = () => {
    if (garmentStreamRef.current) {
      garmentStreamRef.current.getTracks().forEach((track) => track.stop());
      garmentStreamRef.current = null;
    }
    setIsGarmentCameraActive(false);
  };

  const captureGarmentPhoto = () => {
    if (garmentVideoRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = garmentVideoRef.current.videoWidth || 640;
      canvas.height = garmentVideoRef.current.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // Draw the image directly without mirroring
        ctx.drawImage(garmentVideoRef.current, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
        setScrapedImageUrl(dataUrl);
        setScrapeError("");
        stopGarmentCamera();
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

  const handleGarmentFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setScrapedImageUrl(event.target.result as string);
        setScrapeError(""); // clear any scraping error upon manual override
      }
    };
    reader.readAsDataURL(file);
  };

  const triggerTryOn = async () => {
    if (!userImage) {
      setPipelineError("Please upload or capture a photo of yourself.");
      return;
    }
    if (garmentMode === "link" && !productUrl) {
      setPipelineError("Please provide a product URL.");
      return;
    }
    if (garmentMode === "upload" && !scrapedImageUrl) {
      setPipelineError("Please upload a garment image.");
      return;
    }
    if (garmentMode === "camera" && !scrapedImageUrl) {
      setPipelineError("Please capture a garment image.");
      return;
    }

    setIsProcessing(true);
    setPipelineError("");
    setResultImage("");

    let finalScrapedUrl = scrapedImageUrl;

    if (garmentMode === "link" && !finalScrapedUrl) {
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
          garmentMode,
          garmentType,
          productUrl: garmentMode === "link" ? productUrl : "",
        }),
      });

      let data: any = {};
      const responseText = await response.text();
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        data = { error: responseText || `HTTP Error ${response.status}: ${response.statusText}` };
      }

      if (!response.ok) {
        throw new Error(data.details || data.error || `Generation failed: ${response.statusText || response.status}`);
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

  const downloadImage = () => {
    if (!resultImage) return;
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yy = String(now.getFullYear()).slice(-2);
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");

    const filename = `fitcheckai-${dd}${mm}${yy}${hh}${min}${ss}.jpg`;

    const link = document.createElement("a");
    link.href = resultImage;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  const isFormInvalid = !userImage || (garmentMode === "link" ? !productUrl : !scrapedImageUrl);

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
        {/* Step 1: Garment Input */}
        <motion.section variants={itemVariants} className="w-full flex flex-col gap-4 group">
          <label className="text-sm font-medium text-zinc-900 flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-zinc-100 border border-zinc-200 text-zinc-600 text-[11px] font-semibold font-mono transition-colors group-focus-within:bg-zinc-900 group-focus-within:text-white group-focus-within:border-zinc-900">1</span>
            Garment Image
          </label>

          {/* Garment Selector Tabs */}
          <div className="flex p-[3px] rounded-lg bg-zinc-100/80 border border-zinc-200/60 w-fit">
            <button
              type="button"
              onClick={() => {
                setGarmentMode("link");
                setScrapedImageUrl("");
                setScrapeError("");
                stopGarmentCamera();
              }}
              className={`relative px-4 py-1.5 rounded-md text-[13px] font-medium flex items-center gap-2 transition-all ${garmentMode === "link"
                ? "text-zinc-900"
                : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50"
                }`}
            >
              {garmentMode === "link" && (
                <motion.div layoutId="garmentTab" className="absolute inset-0 bg-white rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-zinc-200/50" />
              )}
              <span className="relative z-10 flex items-center gap-2"><LinkIcon className="w-3.5 h-3.5" /> Product Link</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setGarmentMode("upload");
                setScrapedImageUrl("");
                setScrapeError("");
                stopGarmentCamera();
              }}
              className={`relative px-4 py-1.5 rounded-md text-[13px] font-medium flex items-center gap-2 transition-all ${garmentMode === "upload"
                ? "text-zinc-900"
                : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50"
                }`}
            >
              {garmentMode === "upload" && (
                <motion.div layoutId="garmentTab" className="absolute inset-0 bg-white rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-zinc-200/50" />
              )}
              <span className="relative z-10 flex items-center gap-2"><Upload className="w-3.5 h-3.5" /> Upload Garment</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setGarmentMode("camera");
                setScrapedImageUrl("");
                setScrapeError("");
                startGarmentCamera();
              }}
              className={`relative px-4 py-1.5 rounded-md text-[13px] font-medium flex items-center gap-2 transition-all ${garmentMode === "camera"
                ? "text-zinc-900"
                : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50"
                }`}
            >
              {garmentMode === "camera" && (
                <motion.div layoutId="garmentTab" className="absolute inset-0 bg-white rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-zinc-200/50" />
              )}
              <span className="relative z-10 flex items-center gap-2"><Camera className="w-3.5 h-3.5" /> Camera</span>
            </button>
          </div>

          <AnimatePresence mode="wait">
            {garmentMode === "link" ? (
              <motion.div
                key="garment-link"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="w-full"
              >
                <div className="relative flex items-center shadow-sm rounded-lg overflow-hidden border border-zinc-200 focus-within:ring-2 focus-within:ring-zinc-900 focus-within:border-zinc-900 transition-all duration-300 bg-white hover:border-zinc-300 pr-2">
                  <div className="absolute left-3.5 text-zinc-400 group-focus-within:text-zinc-900 transition-colors duration-300">
                    <LinkIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    placeholder="Paste Product URL from any website like Flipkart, Myntra, Amazon etc..."
                    value={productUrl}
                    onChange={handleUrlChange}
                    onBlur={handleBlurProductUrl}
                    className="flex-1 pl-10 pr-2 py-3 text-[14px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none bg-transparent"
                    disabled={isProcessing}
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    {productUrl ? (
                      <button
                        type="button"
                        onClick={handleClearProductUrl}
                        className="p-1.5 hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 rounded-md transition-colors"
                        title="Clear link"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handlePasteProductUrl}
                        className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200/80 text-zinc-600 hover:text-zinc-900 text-[11px] font-medium rounded flex items-center gap-1 transition-all"
                        title="Paste link"
                      >
                        <Clipboard className="w-3.5 h-3.5" />
                        <span>Paste</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Visual Confirmation of successfully scraped/selected URL image */}
                {scrapedImageUrl && !scrapeError && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-3 p-2 bg-white border border-zinc-200 rounded-lg flex items-center gap-3 w-fit shadow-sm animate-in fade-in slide-in-from-bottom-1"
                  >
                    <div className="relative w-12 h-16 rounded overflow-hidden border border-zinc-100 bg-zinc-50 shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={scrapedImageUrl} className="w-full h-full object-contain" alt="Extracted product" />
                    </div>
                    <div className="flex flex-col gap-0.5 pr-2">
                      <span className="text-[10px] font-mono text-emerald-600 font-semibold uppercase tracking-wider">✓ Extracted Successfully</span>
                      <span className="text-xs text-zinc-500 max-w-[200px] truncate">{productUrl}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setScrapedImageUrl("")}
                      className="p-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-md transition-colors"
                      title="Clear image"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </motion.div>
                )}

                {/* Fallback Manual Upload & Image Search Options on Scrape Failure */}
                {scrapeError && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-3 p-4 bg-zinc-50 border border-zinc-200 rounded-lg flex flex-col gap-4 shadow-sm"
                  >
                    <div>
                      <p className="text-[12px] font-medium text-zinc-700">
                        Auto-extraction failed (Amazon/Flipkart blocked the cloud server).
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        We tried searching online for backup images or you can upload manually.
                      </p>
                    </div>

                    {/* Image Search Suggestions Fallback UI */}
                    {isSearchingImages ? (
                      <div className="flex items-center gap-2 text-[12px] text-zinc-500 py-1">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-zinc-400" />
                        Searching for backup product images...
                      </div>
                    ) : suggestedImages.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest font-semibold">
                          Suggested Images (Click to Select)
                        </span>
                        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
                          {suggestedImages.map((img, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                setScrapedImageUrl(img.url);
                                setScrapeError(""); // clear error to show visual preview
                              }}
                              className="relative w-16 h-20 bg-white border border-zinc-200 rounded-lg overflow-hidden shrink-0 hover:border-zinc-400 transition-all p-1 flex items-center justify-center group shadow-sm"
                              title={img.title}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={img.thumbnail}
                                alt={img.title}
                                className="w-full h-full object-contain rounded"
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-t border-zinc-200/60 pt-3 gap-3">
                      <span className="text-[11px] text-zinc-400 font-mono">
                        Not what you wanted? Use manual override:
                      </span>
                      <div className="shrink-0 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => garmentFileInputRef.current?.click()}
                          className="px-3 py-1.5 bg-white border border-zinc-200 hover:bg-zinc-50 text-[12px] font-medium text-zinc-700 rounded-md transition-colors shadow-sm"
                        >
                          Upload Image
                        </button>
                        <input
                          type="file"
                          ref={garmentFileInputRef}
                          onChange={handleGarmentFileUpload}
                          accept="image/*"
                          className="hidden"
                        />
                        {scrapedImageUrl && (
                          <span className="text-[12px] text-emerald-600 font-medium flex items-center gap-1">
                            ✓ Selected
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            ) : scrapedImageUrl ? (
              <motion.div
                key="garment-preview"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="w-full sm:w-96 aspect-video bg-white border border-zinc-200 rounded-xl overflow-hidden p-2 shadow-sm relative group flex items-center justify-center"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={scrapedImageUrl}
                  alt="Garment Preview"
                  className="w-full h-full object-contain rounded-lg"
                />
                <div className="absolute inset-0 bg-zinc-900/0 group-hover:bg-zinc-900/5 transition-colors pointer-events-none rounded-lg" />
                <div className="absolute top-4 right-4 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setScrapedImageUrl("");
                      if (garmentMode === "camera") {
                        startGarmentCamera();
                      }
                    }}
                    className="p-1.5 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-500 hover:text-zinc-900 rounded-full shadow-sm transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            ) : garmentMode === "upload" ? (
              <motion.div
                key="garment-upload"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-4"
              >
                <div
                  onClick={() => garmentFileInputRef.current?.click()}
                  className="w-full sm:w-96 aspect-video bg-zinc-50 hover:bg-zinc-100 border border-dashed border-zinc-300 hover:border-zinc-400 rounded-xl flex flex-col items-center justify-center gap-3 cursor-pointer group transition-colors"
                >
                  <motion.div whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 400 }}>
                    <Upload className="w-5 h-5 text-zinc-400 group-hover:text-zinc-600 transition-colors" />
                  </motion.div>
                  <div className="text-center">
                    <p className="text-[14px] font-medium text-zinc-700">Click to upload garment photo</p>
                    <p className="text-[12px] text-zinc-500 mt-1">JPEG or PNG (Max 5MB)</p>
                  </div>
                  <input
                    type="file"
                    ref={garmentFileInputRef}
                    onChange={handleGarmentFileUpload}
                    accept="image/*"
                    className="hidden"
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="garment-camera"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="relative w-full sm:w-96 aspect-video bg-zinc-100 border border-zinc-200 rounded-xl overflow-hidden flex flex-col"
              >
                {isGarmentCameraActive ? (
                  <>
                    <video
                      ref={garmentVideoRef}
                      autoPlay
                      playsInline
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-4 flex justify-center z-10">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={captureGarmentPhoto}
                        className="px-5 py-2 bg-white/90 backdrop-blur-md border border-zinc-200/50 text-zinc-900 rounded-full text-[13px] font-semibold shadow-sm transition-all hover:bg-white"
                      >
                        Capture
                      </motion.button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center flex-1 text-center p-6 gap-3 text-zinc-500">
                    <Camera className="w-6 h-6 animate-pulse text-zinc-400" />
                    {garmentCameraError ? (
                      <p className="text-[13px] text-red-500 px-4">{garmentCameraError}</p>
                    ) : (
                      <p className="text-[13px] text-zinc-500">Requesting camera permissions...</p>
                    )}
                    <button
                      type="button"
                      onClick={startGarmentCamera}
                      className="mt-2 px-4 py-1.5 rounded-md border border-zinc-200 bg-white text-[12px] font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 transition-colors"
                    >
                      Retry Camera
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Garment Type Selector */}
          <div className="flex flex-col gap-2 mt-2">
            <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-widest font-semibold">
              Garment Category
            </span>
            <div className="flex p-[3px] rounded-lg bg-zinc-100/80 border border-zinc-200/60 w-fit">
              {([
                { key: "auto" as const, label: "Auto Detect", icon: "✨" },
                { key: "tops" as const, label: "Top", icon: "👕" },
                { key: "bottoms" as const, label: "Bottom", icon: "👖" },
                { key: "dress" as const, label: "Dress", icon: "👗" },
              ]).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setGarmentType(item.key)}
                  className={`relative px-3.5 py-1.5 rounded-md text-[13px] font-medium flex items-center gap-1.5 transition-all ${garmentType === item.key
                    ? "text-zinc-900"
                    : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50"
                  }`}
                >
                  {garmentType === item.key && (
                    <motion.div layoutId="garmentTypeTab" className="absolute inset-0 bg-white rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-zinc-200/50" />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">{item.icon} {item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </motion.section>

        {/* Step 2: Your Photo */}
        <motion.section variants={itemVariants} className="w-full flex flex-col gap-4 group">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-900 flex items-center gap-2">
              <span className={`flex items-center justify-center w-5 h-5 rounded-full border text-[11px] font-semibold font-mono transition-colors ${userImage ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-zinc-100 border-zinc-200 text-zinc-600'}`}>2</span>
              Your Photo
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
            whileHover={{ scale: (isProcessing || isFormInvalid) ? 1 : 1.02 }}
            whileTap={{ scale: (isProcessing || isFormInvalid) ? 1 : 0.98 }}
            onClick={triggerTryOn}
            disabled={isProcessing || isFormInvalid}
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
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadImage}
                  className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-[13px] font-medium rounded-md transition-colors shadow-sm active:bg-zinc-950 flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
                <button
                  onClick={() => setResultImage("")}
                  className="px-3 py-1.5 bg-white border border-zinc-200 hover:bg-zinc-50 text-[13px] font-medium text-zinc-700 rounded-md transition-colors shadow-sm active:bg-zinc-100"
                >
                  Clear Result
                </button>
              </div>
            </div>

            <div className="flex flex-col items-center gap-4">
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
              <p className="text-[13px] text-zinc-500 font-medium tracking-tight">
                If not impressed by the result, try again.
              </p>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Processing Overlay - Interactive Fitting Room Scanner */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-zinc-50/95 backdrop-blur-md flex flex-col items-center justify-center p-6"
          >
            <div className="w-full max-w-md flex flex-col items-center gap-8">
              {/* Header */}
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 bg-zinc-900 rounded-[5px] flex items-center justify-center">
                  <Sparkles className="w-3 h-3 text-white animate-pulse" />
                </div>
                <span className="text-[13px] font-semibold tracking-tight text-zinc-900 uppercase tracking-widest font-mono">
                  Virtual Fitting Room
                </span>
              </div>

              {/* Visual Merging Area */}
              <div className="flex items-center justify-center gap-6 relative">
                {/* Garment Preview */}
                <div className="relative w-28 h-36 rounded-xl border border-zinc-200 overflow-hidden shadow-md bg-white p-1 flex items-center justify-center group">
                  {scrapedImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={scrapedImageUrl}
                      alt="Garment Preview"
                      className="w-full h-full object-contain rounded-lg"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-50 rounded-lg text-zinc-400 gap-1.5 p-2 text-center">
                      <LinkIcon className="w-5 h-5 animate-pulse text-zinc-500" />
                      <span className="text-[10px] font-mono leading-tight">Extracting...</span>
                    </div>
                  )}
                  {/* Emerald scanning line */}
                  <motion.div
                    className="absolute inset-x-0 h-0.5 bg-emerald-500 shadow-[0_0_8px_#10b981]"
                    animate={{ top: ["4%", "96%", "4%"] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <div className="absolute inset-0 bg-emerald-500/5 pointer-events-none" />
                </div>

                {/* Connection/Merging Indicator */}
                <div className="flex flex-col items-center justify-center z-10">
                  <motion.div
                    animate={{
                      scale: [1, 1.1, 1],
                      rotate: 360
                    }}
                    transition={{
                      scale: { duration: 2, repeat: Infinity, ease: "easeInOut" },
                      rotate: { duration: 6, repeat: Infinity, ease: "linear" }
                    }}
                    className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-800 shadow-lg text-white"
                  >
                    <RefreshCw className="w-4 h-4 text-emerald-400" />
                  </motion.div>
                </div>

                {/* User Photo Preview */}
                <div className="relative w-28 h-36 rounded-xl border border-zinc-200 overflow-hidden shadow-md bg-white p-1 flex items-center justify-center group">
                  {userImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={userImage}
                      alt="Your Photo"
                      className="w-full h-full object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-full h-full bg-zinc-50 rounded-lg" />
                  )}
                  {/* Emerald scanning line */}
                  <motion.div
                    className="absolute inset-x-0 h-0.5 bg-emerald-500 shadow-[0_0_8px_#10b981]"
                    animate={{ top: ["4%", "96%", "4%"] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
                  />
                  <div className="absolute inset-0 bg-emerald-500/5 pointer-events-none" />
                </div>
              </div>

              {/* Progress Bar & Phase Status */}
              <div className="w-full text-center flex flex-col gap-3">
                <div className="flex items-center justify-between text-xs text-zinc-500 font-mono px-1">
                  <span>{loadingPhase}</span>
                  <span className="font-semibold text-zinc-900">{loadingProgress}%</span>
                </div>

                {/* Progress Track */}
                <div className="w-full h-1.5 bg-zinc-200 rounded-full overflow-hidden relative shadow-inner">
                  <div
                    className="h-full bg-zinc-900 rounded-full relative transition-all duration-300 ease-out"
                    style={{ width: `${loadingProgress}%` }}
                  />
                </div>

                <p className="text-[12px] text-zinc-400 font-mono mt-1 animate-pulse">
                  Fitcheck AI is processing...
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="text-[12px] font-mono text-zinc-500 border-t border-zinc-200 pt-8 mt-auto flex flex-col sm:flex-row items-center justify-between gap-4"
      >
        <span className="text-center sm:text-left">FitCheck.AI by <a href="https://dhyani.site" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-900 transition-colors">Vijay Dhyani</a> &copy; {new Date().getFullYear()}</span>
        <span className="text-zinc-400 text-center">For feedback and suggestions, mail us at <a href="mailto:hello@dhyani.site" className="text-zinc-500 hover:text-zinc-900 underline transition-colors">hello@dhyani.site</a></span>
        <div className="flex items-center gap-6">
          <a href="#" className="hover:text-zinc-900 transition-colors">Privacy</a>
          <a href="#" className="hover:text-zinc-900 transition-colors">Terms</a>
        </div>
      </motion.footer>
    </div>
  );
}
