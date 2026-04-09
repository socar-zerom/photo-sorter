'use client'

const PERIODS = [
  { key: 'daily', label: '일간' },
  { key: 'weekly', label: '주간' },
  { key: 'all', label: '누적' },
] as const

type Period = typeof PERIODS[number]['key']

export default function PeriodTabs({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
      {PERIODS.map(p => (
        <button key={p.key} onClick={() => onChange(p.key)}
          className={`px-4 py-2 rounded-md text-sm font-medium transition cursor-pointer active:scale-95 ${
            value === p.key ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'
          }`}>
          {p.label}
        </button>
      ))}
    </div>
  )
}
