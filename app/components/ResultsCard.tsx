import type { FieldResult } from '@/lib/types';

const statusConfig = {
  PASS: {
    icon: '✓',
    label: 'PASS',
    wrapperClass: 'bg-green-50 border-green-200',
    iconClass: 'text-green-600',
    labelClass: 'text-green-700',
  },
  REVIEW: {
    icon: '!',
    label: 'REVIEW',
    wrapperClass: 'bg-yellow-50 border-yellow-200',
    iconClass: 'text-yellow-600',
    labelClass: 'text-yellow-700',
  },
  FAIL: {
    icon: '✗',
    label: 'FAIL',
    wrapperClass: 'bg-red-50 border-red-200',
    iconClass: 'text-red-600',
    labelClass: 'text-red-700',
  },
} as const;

export default function ResultsCard({ results }: { results: FieldResult[] }) {
  return (
    <div className="mt-6 space-y-3">
      <h2 className="text-lg font-semibold text-gray-900">Verification Results</h2>
      {results.map((result) => {
        const cfg = statusConfig[result.status];
        return (
          <div key={result.field} className={`rounded-lg border p-4 ${cfg.wrapperClass}`}>
            <div className="flex items-center gap-3">
              <span className={`text-xl font-bold w-6 text-center ${cfg.iconClass}`}>
                {cfg.icon}
              </span>
              <span className="font-medium text-gray-900 flex-1">{result.field}</span>
              <span className={`text-sm font-semibold ${cfg.labelClass}`}>{cfg.label}</span>
            </div>
            <p className="mt-1 ml-9 text-sm text-gray-700">{result.reason}</p>
          </div>
        );
      })}
    </div>
  );
}
