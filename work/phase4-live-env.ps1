$phase4State=Get-Content -LiteralPath 'C:/Users/garus/Documents/Codex/2026-10-07/taskdoon/work/phase4-live-state.json' -Raw | ConvertFrom-Json
$phase4Db=$phase4State.database
if($phase4Db -notmatch '^phase4_live_[a-f0-9]{10}$'){throw 'Invalid isolated live database'}
$env:DATABASE_MIGRATOR_URL="postgres://taskin_migrator:taskin_migrator@127.0.0.1:5432/$phase4Db"
$env:API_LOG=$phase4State.apiLog
$env:BASE_URL='http://localhost:3000'
$env:CHROMIUM_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
$phase4Node=(Get-Command node).Source
$env:GRANT_PLATFORM_ADMIN='"{0}" "{1}" grant' -f $phase4Node, 'C:/Users/garus/OneDrive/Desktop/taskin/apps/api/dist/cli/platform-admin.js'