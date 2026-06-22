'use client';

import { useState, useRef, useCallback } from 'react';
import type { FieldResult } from '@/lib/types';

interface Props {
  onResults: (results: FieldResult[]) => void;
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
}

const APPLICATION_FIELDS = [
  { name: 'brandName', label: 'Brand Name' },
  { name: 'classType', label: 'Class / Type' },
  { name: 'alcoholContent', label: 'Alcohol Content' },
  { name: 'netContents', label: 'Net Contents' },
] as const;

export default function UploadForm({ onResults, isLoading, setIsLoading, setError }: Props) {
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        setError('Please upload an image file (JPEG, PNG, GIF, or WebP).');
        return;
      }
      setImage(file);
      setPreview(URL.createObjectURL(file));
      setError(null);
    },
    [setError],
  );

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!image) {
      setError('Please select a label image before verifying.');
      return;
    }

    const form = e.currentTarget;
    const formData = new FormData();
    formData.append('image', image);
    for (const { name } of APPLICATION_FIELDS) {
      formData.append(name, (form.elements.namedItem(name) as HTMLInputElement).value);
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/verify', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
      } else {
        onResults(data.results);
      }
    } catch {
      setError('Could not reach the server. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Image upload drop zone */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Label Image</label>
        <div
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          {preview ? (
            <img src={preview} alt="Label preview" className="max-h-48 mx-auto rounded" />
          ) : (
            <p className="text-gray-500 text-sm">
              Drop your label image here, or click to choose a file
            </p>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </div>

      {/* Application data fields */}
      {APPLICATION_FIELDS.map(({ name, label }) => (
        <div key={name}>
          <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">
            {label}
          </label>
          <input
            id={name}
            name={name}
            type="text"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder={`Enter ${label.toLowerCase()} from application`}
          />
        </div>
      ))}

      {/* Government Warning — informational, always auto-verified */}
      <div className="rounded-md bg-gray-50 border border-gray-200 p-3">
        <p className="text-sm font-medium text-gray-700">Government Warning</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Auto-verified against the TTB-required standard text.
        </p>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-md bg-blue-600 px-4 py-3 text-base font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading ? 'Verifying label…' : 'Verify Label'}
      </button>
    </form>
  );
}
