'use client';

import { useState } from 'react';
import UploadForm from './components/UploadForm';
import ResultsCard from './components/ResultsCard';
import type { FieldResult } from '@/lib/types';

export default function Home() {
  const [results, setResults] = useState<FieldResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="min-h-screen py-10">
      <div className="mx-auto max-w-xl px-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">TTB Label Verification</h1>
        <p className="text-sm text-gray-500 mb-8">
          Upload a label image and enter the application data to check that they match.
        </p>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <UploadForm
            onResults={(r) => {
              setResults(r);
              setError(null);
            }}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            setError={setError}
          />

          {error && (
            <div className="mt-4 rounded-md bg-red-50 border border-red-200 p-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {results && <ResultsCard results={results} />}
        </div>
      </div>
    </main>
  );
}
