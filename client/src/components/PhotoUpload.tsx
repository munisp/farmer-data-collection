import { useState, useRef } from 'react';
import { Camera, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface PhotoUploadProps {
  currentPhotoUrl?: string;
  onPhotoChange: (photoUrl: string | null) => void;
  disabled?: boolean;
}

export function PhotoUpload({ currentPhotoUrl, onPhotoChange, disabled }: PhotoUploadProps) {
  const [preview, setPreview] = useState<string | null>(currentPhotoUrl || null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB');
      return;
    }

    setIsUploading(true);

    try {
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setPreview(result);
        onPhotoChange(result);
      };
      reader.readAsDataURL(file);

      toast.success('Photo uploaded successfully');
    } catch (error) {
      console.error('Error uploading photo:', error);
      toast.error('Failed to upload photo');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemovePhoto = () => {
    setPreview(null);
    onPhotoChange(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    toast.success('Photo removed');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {preview ? (
          <div className="relative">
            <img
              src={preview}
              alt="Farmer photo"
              className="w-32 h-32 object-cover rounded-lg border-2 border-border"
            />
            {!disabled && (
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                onClick={handleRemovePhoto}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ) : (
          <div className="w-32 h-32 bg-muted rounded-lg border-2 border-dashed border-border flex items-center justify-center">
            <Camera className="h-8 w-8 text-muted-foreground" />
          </div>
        )}

        {!disabled && (
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              Upload Photo
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => cameraInputRef.current?.click()}
              disabled={isUploading}
              className="gap-2"
            >
              <Camera className="h-4 w-4" />
              Take Photo
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Upload a photo or take one with your camera. Maximum size: 5MB
      </p>
    </div>
  );
}
