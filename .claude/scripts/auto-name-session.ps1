# Claude Code UserPromptSubmit hook — auto-names the session after the MyJKKN
# module you're working on, so the `claude --resume` picker is self-labeling.
#
# How it works: reads the hook JSON on stdin, scans your prompt for module
# keywords (priority order, first match wins), and emits
# {"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","sessionTitle":"<module>"}}.
# When no module keyword is found it stays SILENT — so a follow-up like
# "yes, continue" never resets a meaningful title back to "general".

$ErrorActionPreference = 'SilentlyContinue'

$raw = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($raw)) { exit 0 }

try { $data = $raw | ConvertFrom-Json } catch { exit 0 }

$promptText = [string]$data.prompt
if ([string]::IsNullOrWhiteSpace($promptText)) { exit 0 }

# PowerShell -match is case-insensitive and regex-aware. \b = word boundary.
$modules = @(
  @{ title = 'campus-living'; patterns = @('hostel', 'campus living', '\bmess\b', '\bblock\b', '\bbed\b', '\broom\b', 'amenit', 'warden', 'occupanc') },
  @{ title = 'admission';     patterns = @('admission', 'counsel', '\blead\b', '\bleads\b', 'enquir', 'prospect', 'gate entry', 'campaign', 'consultant', 'referral') },
  @{ title = 'billing';       patterns = @('billing', '\bfee\b', '\bfees\b', 'invoice', 'payment', 'refund', 'discount') },
  @{ title = 'learners';      patterns = @('learner', 'student', 'onboarding') },
  @{ title = 'staff-hr';      patterns = @('\bstaff\b', 'employee', '\bhr\b', 'faculty', 'payroll', '\bleave\b', 'onduty') },
  @{ title = 'attendance';    patterns = @('attendance') },
  @{ title = 'timetable';     patterns = @('timetable', '\bperiod\b', 'regulation', 'course-grade') },
  @{ title = 'ims-inventory'; patterns = @('\bims\b', 'inventory', '\bstore\b', '\bstores\b', 'indent', '\bgrn\b', '\bstock\b') },
  @{ title = 'accreditation'; patterns = @('accreditation', '\bnaac\b', '\bnba\b') },
  @{ title = 'permissions';   patterns = @('permission', '\brole\b', '\broles\b', '\brbac\b', '\brls\b', 'rbac') },
  @{ title = 'whatsapp';      patterns = @('whatsapp', '\bwaba\b', 'meta cloud', 'message queue') },
  @{ title = 'auth-login';    patterns = @('\bauth\b', '\blogin\b', '\bsaml\b', '\boauth\b', '\blti\b', 'sign in', 'sign-in') }
)

$title = $null
foreach ($m in $modules) {
  foreach ($pat in $m.patterns) {
    if ($promptText -match $pat) { $title = $m.title; break }
  }
  if ($title) { break }
}

# No confident match -> leave the current session title untouched.
if (-not $title) { exit 0 }

$payload = @{
  hookSpecificOutput = @{
    hookEventName = 'UserPromptSubmit'
    sessionTitle  = $title
  }
}

[Console]::Out.Write(($payload | ConvertTo-Json -Compress -Depth 4))
exit 0
