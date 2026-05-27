import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Upload, X, Check } from "lucide-react";
import { toast } from "sonner";

interface CameraUploadProps {
  onImageCapture: (imageData: string, file: File) => void;
  maxSizeMB?: number;
  quality?: number;
}

export function CameraUpload({ 
  onImageCapture, 
  maxSizeMB = 2,
  quality = 0.8 
}: CameraUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Check if device has camera
  const hasCamera = 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices;

  // Start camera stream
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment", // Use back camera on mobile
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsCapturing(true);
    } catch (error) {
      console.error("Camera access error:", error);
      toast.error("Camera access denied. Please allow camera permissions or use file upload.");
    }
  };

  // Stop camera stream
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCapturing(false);
  };

  // Capture photo from video stream
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    if (!context) return;

    // Set canvas size to video size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert canvas to blob with compression
    canvas.toBlob(
      async (blob) => {
        if (!blob) return;

        // Check file size
        const sizeMB = blob.size / (1024 * 1024);
        if (sizeMB > maxSizeMB) {
          toast.error(`Image too large (${sizeMB.toFixed(1)}MB). Maximum ${maxSizeMB}MB allowed.`);
          return;
        }

        // Create File object
        const file = new File([blob], `photo_${Date.now()}.jpg`, { type: "image/jpeg" });

        // Create preview URL
        const imageData = canvas.toDataURL("image/jpeg", quality);
        setPreview(imageData);

        // Stop camera
        stopCamera();

        // Call callback
        onImageCapture(imageData, file);
        toast.success("Photo captured successfully!");
      },
      "image/jpeg",
      quality
    );
  };

  // Handle file upload (fallback for desktop or no camera)
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    // Check file size
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > maxSizeMB) {
      toast.error(`Image too large (${sizeMB.toFixed(1)}MB). Maximum ${maxSizeMB}MB allowed.`);
      return;
    }

    // Compress and create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Resize if too large
        const maxDimension = 1920;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = (height / width) * maxDimension;
            width = maxDimension;
          } else {
            width = (width / height) * maxDimension;
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) return;

            const compressedFile = new File([blob], file.name, { type: "image/jpeg" });
            const imageData = canvas.toDataURL("image/jpeg", quality);
            setPreview(imageData);
            onImageCapture(imageData, compressedFile);
            toast.success("Image uploaded successfully!");
          },
          "image/jpeg",
          quality
        );
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Clear preview
  const clearPreview = () => {
    setPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      {/* Preview */}
      {preview && (
        <div className="relative rounded-lg overflow-hidden border">
          <img src={preview} alt="Preview" className="w-full h-auto" />
          <div className="absolute top-2 right-2 flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={clearPreview}
              className="bg-white/90 hover:bg-white"
            >
              <X className="h-4 w-4 mr-1" />
              Remove
            </Button>
          </div>
          <div className="absolute bottom-2 left-2 bg-green-500 text-white px-3 py-1 rounded-full text-sm flex items-center gap-1">
            <Check className="h-4 w-4" />
            Ready to upload
          </div>
        </div>
      )}

      {/* Camera View */}
      {isCapturing && !preview && (
        <div className="relative rounded-lg overflow-hidden border bg-black">
          <video
            ref={videoRef}
            className="w-full h-auto"
            autoPlay
            playsInline
            muted
          />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
            <Button
              size="lg"
              onClick={capturePhoto}
              className="bg-white text-black hover:bg-gray-200 rounded-full h-16 w-16 p-0"
            >
              <Camera className="h-8 w-8" />
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={stopCamera}
              className="bg-red-500 text-white hover:bg-red-600 rounded-full"
            >
              <X className="h-5 w-5 mr-2" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Upload Buttons */}
      {!isCapturing && !preview && (
        <div className="flex flex-col sm:flex-row gap-3">
          {hasCamera && (
            <Button
              onClick={startCamera}
              className="flex-1 h-12 text-base"
              variant="default"
            >
              <Camera className="h-5 w-5 mr-2" />
              Take Photo
            </Button>
          )}
          <Button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 h-12 text-base"
            variant="outline"
          >
            <Upload className="h-5 w-5 mr-2" />
            Upload from Gallery
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      )}

      {/* Instructions */}
      <p className="text-sm text-muted-foreground text-center">
        {hasCamera
          ? "Take a photo with your camera or upload from gallery"
          : "Upload an image from your device"}
        <br />
        Maximum file size: {maxSizeMB}MB
      </p>
    </div>
  );
}
