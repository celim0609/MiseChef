import { ImagePlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export default function WeekCoverUpload({ weekNumber, imageUrl, file, disabled, error, onFileChange }: {
  weekNumber: number;
  imageUrl?: string;
  file?: File;
  disabled?: boolean;
  error?: string;
  onFileChange: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState('');
  const [validationError, setValidationError] = useState('');
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const label = file || imageUrl ? 'Replace Image' : 'Upload Image';
  return <div role="group" aria-label={`Week ${weekNumber} cover image`} className="space-y-2">
    <p className="text-sm font-bold text-primary">Week cover image</p>
    <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp" aria-label={`Week ${weekNumber} cover image file`} disabled={disabled} onChange={event => {
      const selected = event.target.files?.[0];
      event.target.value = '';
      if (!selected) return;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) || selected.size > 10 * 1024 * 1024) {
        setValidationError('Choose a JPEG, PNG or WebP image up to 10 MB.');
        return;
      }
      setValidationError('');
      onFileChange(selected);
    }} />
    {(preview || imageUrl) && <img src={preview || imageUrl} alt={`Week ${weekNumber} cover`} className="h-24 w-36 rounded-xl border border-surface-container-high object-contain" />}
    <button type="button" disabled={disabled} aria-label={`Week ${weekNumber} ${label}`} onClick={() => input.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 font-sans text-xs font-extrabold text-on-primary disabled:opacity-50">
      <ImagePlus className="h-4 w-4" aria-hidden="true" /> {label}
    </button>
    <p className="break-words text-xs text-on-surface-variant">{file ? `${file.name} — save changes to update the cover.` : 'JPEG, PNG or WebP · Up to 10 MB'}</p>
    {(validationError || error) && <p role="alert" className="text-sm font-bold text-error">{validationError || error}</p>}
  </div>;
}
