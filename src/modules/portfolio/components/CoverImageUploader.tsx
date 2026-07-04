import { useRef, useState } from 'react';
import { uploadPortfolioHeroBackground } from '../../../services/storage';

interface CoverImageUploaderProps {
  backgroundImageUrl?: string;
  userId?: string;
  onChange: (backgroundImageUrl?: string) => void;
}

const supportedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];

export default function CoverImageUploader({ backgroundImageUrl, userId, onChange }: CoverImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');

  const handleSelectFile = async (file?: File) => {
    if (!file) return;

    if (!supportedImageTypes.includes(file.type)) {
      setUploadError('Use a JPG, PNG, or WEBP image.');
      return;
    }

    if (!userId) {
      setUploadError('Sign in to upload a cover image.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadError('');

    try {
      const downloadUrl = await uploadPortfolioHeroBackground({
        userId,
        file,
        onProgress: setUploadProgress,
      });
      onChange(downloadUrl);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to upload cover image.');
    } finally {
      setIsUploading(false);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  const handleRemove = () => {
    setUploadError('');
    setUploadProgress(0);
    onChange(undefined);
  };

  return (
    <div className="rounded-2xl border border-dashed border-surface-container-high bg-white p-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-sans text-xs font-extrabold text-primary uppercase tracking-[0.16em]">Cover Image</p>
          <p className="font-sans text-sm font-bold text-on-surface-variant mt-2">Upload a JPG, PNG, or WEBP image for the Portfolio Hero background.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading || !userId}
            className="rounded-full bg-primary px-4 py-2 font-sans text-xs font-extrabold text-on-primary shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
          >
            {backgroundImageUrl ? 'Replace' : 'Upload'}
          </button>
          {backgroundImageUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={isUploading}
              className="rounded-full border border-surface-container-high px-4 py-2 font-sans text-xs font-extrabold text-primary transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={event => handleSelectFile(event.target.files?.[0])}
        className="hidden"
      />

      {backgroundImageUrl ? (
        <div className="overflow-hidden rounded-2xl border border-surface-container-high bg-surface-container-low">
          <img src={backgroundImageUrl} alt="Portfolio hero cover preview" className="h-44 w-full object-cover" referrerPolicy="no-referrer" />
        </div>
      ) : (
        <div className="flex h-36 items-center justify-center rounded-2xl border border-surface-container-high bg-surface-container-low px-4 text-center">
          <p className="font-sans text-sm font-bold text-on-surface-variant">No cover image uploaded yet.</p>
        </div>
      )}

      {isUploading && (
        <p className="font-sans text-xs font-extrabold text-secondary">Uploading cover image... {uploadProgress}%</p>
      )}
      {uploadError && (
        <p className="font-sans text-xs font-extrabold text-error">{uploadError}</p>
      )}
    </div>
  );
}
