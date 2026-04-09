import { NextResponse } from 'next/server'

export async function GET() {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').trim()

  const script = `#!/bin/bash
set -e

TOKEN="\${1:?Usage: curl -sL '${appUrl}/api/setup' | bash -s -- <API_TOKEN>}"
CONFIG_DIR="$HOME/.config/socar-board"
CLAUDE_SETTINGS="$HOME/.claude/settings.json"

echo "🚀 Claude Code Leaderboard 설치 중..."

# 1. config 디렉토리 생성
mkdir -p "$CONFIG_DIR"

# 2. 토큰 저장
echo -n "$TOKEN" > "$CONFIG_DIR/token"
chmod 600 "$CONFIG_DIR/token"

# 3. API URL 저장
echo -n "${appUrl}" > "$CONFIG_DIR/api_url"

# 4. report-usage.js 다운로드
curl -sL "${appUrl}/report-usage.js" > "$CONFIG_DIR/report-usage.js"

# 5. Claude Code settings.json에 Stop hook 추가 (기존 hook 보존)
if [ ! -f "$CLAUDE_SETTINGS" ]; then
  mkdir -p "$HOME/.claude"
  echo '{}' > "$CLAUDE_SETTINGS"
fi

node -e "
  const fs = require('fs');
  const p = process.env.HOME + '/.claude/settings.json';
  const s = JSON.parse(fs.readFileSync(p,'utf8'));
  if (!s.hooks) s.hooks = {};
  if (!s.hooks.Stop) s.hooks.Stop = [];
  const exists = s.hooks.Stop.some(e => e.hooks && e.hooks.some(h => h.command && h.command.includes('socar-board')));
  if (!exists) {
    s.hooks.Stop.push({matcher:'.*',hooks:[{type:'command',command:'node ' + process.env.HOME + '/.config/socar-board/report-usage.js'}]});
    fs.writeFileSync(p, JSON.stringify(s, null, 2));
  }
"

echo ""
echo "✅ 설치 완료! Claude Code를 사용하면 자동으로 사용량이 추적됩니다."
echo "📊 리더보드: ${appUrl}"
`

  return new NextResponse(script, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
