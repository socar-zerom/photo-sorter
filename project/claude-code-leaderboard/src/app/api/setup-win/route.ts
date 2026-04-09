import { NextResponse } from 'next/server'

export async function GET() {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').trim()

  const script = `
param([string]$Token)
if (-not $Token) { Write-Host "Usage: irm '${appUrl}/api/setup-win?token=<API_TOKEN>' | iex"; exit 1 }

$ErrorActionPreference = "Stop"
$ConfigDir = Join-Path $env:USERPROFILE ".config\\socar-board"
$ClaudeSettings = Join-Path $env:USERPROFILE ".claude\\settings.json"

Write-Host "🚀 Claude Code Leaderboard 설치 중..."

# 1. config 디렉토리 생성
New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null

# 2. 토큰 저장
Set-Content -Path (Join-Path $ConfigDir "token") -Value $Token -NoNewline

# 3. API URL 저장
Set-Content -Path (Join-Path $ConfigDir "api_url") -Value "${appUrl}" -NoNewline

# 4. report-usage.js 다운로드
Invoke-WebRequest -Uri "${appUrl}/report-usage.js" -OutFile (Join-Path $ConfigDir "report-usage.js")

# 5. Claude Code settings.json에 Stop hook 추가 (기존 hook 보존)
$claudeDir = Join-Path $env:USERPROFILE ".claude"
if (-not (Test-Path $ClaudeSettings)) {
    New-Item -ItemType Directory -Force -Path $claudeDir | Out-Null
    Set-Content -Path $ClaudeSettings -Value "{}"
}

$reportPath = (Join-Path $ConfigDir "report-usage.js") -replace '\\\\', '/'
node -e "
  const fs = require('fs');
  const p = process.env.USERPROFILE + '/.claude/settings.json';
  const s = JSON.parse(fs.readFileSync(p,'utf8'));
  if (!s.hooks) s.hooks = {};
  if (!s.hooks.Stop) s.hooks.Stop = [];
  const exists = s.hooks.Stop.some(e => e.hooks && e.hooks.some(h => h.command && h.command.includes('socar-board')));
  if (!exists) {
    s.hooks.Stop.push({matcher:'.*',hooks:[{type:'command',command:'node ' + process.env.USERPROFILE.replace(/\\\\\\\\/g,'/') + '/.config/socar-board/report-usage.js'}]});
    fs.writeFileSync(p, JSON.stringify(s, null, 2));
  }
"

Write-Host ""
Write-Host "✅ 설치 완료! Claude Code를 사용하면 자동으로 사용량이 추적됩니다."
Write-Host "📊 리더보드: ${appUrl}"
`

  // query param에서 token 추출하여 스크립트에 주입
  return new NextResponse(script, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
