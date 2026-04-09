'use client'
import { useState, useEffect } from 'react'

type OS = 'mac' | 'windows'

export default function CurlCommand({ token }: { token: string }) {
  const [copied, setCopied] = useState(false)
  const [os, setOs] = useState<OS>('mac')
  const [appUrl, setAppUrl] = useState(process.env.NEXT_PUBLIC_APP_URL || '')

  useEffect(() => {
    if (!appUrl) setAppUrl(window.location.origin)
  }, [])

  const macCommand = `curl -sL "${appUrl}/api/setup" | bash -s -- ${token}`
  const winCommand = `irm "${appUrl}/api/setup-win" | iex; Install-Leaderboard -Token "${token}"`
  const winSimpleCommand = `powershell -Command "& { $token='${token}'; $dir=\\"$env:USERPROFILE\\.config\\socar-board\\"; New-Item -ItemType Directory -Force -Path $dir | Out-Null; Set-Content -Path \\"$dir\\token\\" -Value $token -NoNewline; Set-Content -Path \\"$dir\\api_url\\" -Value '${appUrl}' -NoNewline; Invoke-WebRequest -Uri '${appUrl}/report-usage.js' -OutFile \\"$dir\\report-usage.js\\"; node -e \\"const fs=require('fs');const p=process.env.USERPROFILE+'/.claude/settings.json';if(!fs.existsSync(p)){fs.mkdirSync(process.env.USERPROFILE+'/.claude',{recursive:true});fs.writeFileSync(p,'{}');}const s=JSON.parse(fs.readFileSync(p,'utf8'));if(!s.hooks)s.hooks={};if(!s.hooks.Stop)s.hooks.Stop=[];if(!s.hooks.Stop.some(e=>e.hooks&&e.hooks.some(h=>h.command&&h.command.includes('socar-board')))){s.hooks.Stop.push({matcher:'.*',hooks:[{type:'command',command:'node '+process.env.USERPROFILE.replace(/\\\\\\\\\\\\\\\\/g,'/')+'/.config/socar-board/report-usage.js'}]});fs.writeFileSync(p,JSON.stringify(s,null,2));}\\"; Write-Host '설치 완료!' }"`

  const command = os === 'mac' ? macCommand : winSimpleCommand

  const handleCopy = () => {
    navigator.clipboard.writeText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-gray-800 rounded p-0.5">
            <button
              onClick={() => { setOs('mac'); setCopied(false) }}
              className={`px-2 py-1 rounded text-xs cursor-pointer transition ${
                os === 'mac' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Mac/Linux
            </button>
            <button
              onClick={() => { setOs('windows'); setCopied(false) }}
              className={`px-2 py-1 rounded text-xs cursor-pointer transition ${
                os === 'windows' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Windows
            </button>
          </div>
          <p className="text-sm text-gray-400">{os === 'mac' ? '터미널에 붙여넣으세요:' : '파워쉘에 붙여넣으세요:'}</p>
        </div>
        <button
          onClick={handleCopy}
          className="px-3 py-1 bg-white text-green-400 border border-green-400 rounded text-xs hover:bg-green-50 active:bg-green-100 active:scale-95 cursor-pointer transition"
        >
          {copied ? '복사됨!' : '복사'}
        </button>
      </div>
      <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm border border-gray-700">
        <code className="text-green-400 break-all">{command}</code>
      </div>
    </div>
  )
}
