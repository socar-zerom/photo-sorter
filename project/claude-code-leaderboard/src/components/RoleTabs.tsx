'use client'

const ROLES = [
  { key: 'all', label: '전체' },
  { key: 'developer', label: '개발자' },
  { key: 'non-developer', label: '비개발자' },
] as const

type Role = typeof ROLES[number]['key']

export default function RoleTabs({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
      {ROLES.map(r => (
        <button key={r.key} onClick={() => onChange(r.key)}
          className={`px-4 py-2 rounded-md text-sm font-medium transition cursor-pointer active:scale-95 ${
            value === r.key ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'
          }`}>
          {r.label}
        </button>
      ))}
    </div>
  )
}
