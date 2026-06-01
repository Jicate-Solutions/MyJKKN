# Source this file in your PowerShell profile to register fzf aliases
# Add to $PROFILE:  . "D:\Projects\MyJKKN\scripts\fzf\setup-aliases.ps1"
#
# Then use short aliases from anywhere:
#   fmig   - browse Supabase migrations
#   fbr    - switch git branch
#   fpg    - navigate to a page/route
#   fsvc   - browse service files
#   fcmp   - browse React components
#   fhk    - browse React Query hooks
#   ftyp   - browse type definitions
#   fgrp   - interactive grep (e.g. fgrp "useAuth")
#   frec   - recently modified files

$fzfScriptsDir = "D:\Projects\MyJKKN\scripts\fzf"

function fmig  { & "$fzfScriptsDir\fzf-migration.ps1" @args }
function fbr   { & "$fzfScriptsDir\fzf-branch.ps1" @args }
function fpg   { & "$fzfScriptsDir\fzf-page.ps1" @args }
function fsvc  { & "$fzfScriptsDir\fzf-service.ps1" @args }
function fcmp  { & "$fzfScriptsDir\fzf-component.ps1" @args }
function fhk   { & "$fzfScriptsDir\fzf-hook.ps1" @args }
function ftyp  { & "$fzfScriptsDir\fzf-type.ps1" @args }
function fgrp  { & "$fzfScriptsDir\fzf-grep.ps1" @args }
function frec  { & "$fzfScriptsDir\fzf-recent.ps1" @args }

# fzf appearance defaults
$env:FZF_DEFAULT_OPTS = "--height 40% --layout=reverse --border --info=inline --color=fg:#c0caf5,bg:#1a1b26,hl:#bb9af7,fg+:#c0caf5,bg+:#283457,hl+:#7dcfff,info:#7aa2f7,prompt:#7dcfff,pointer:#ff007c,marker:#9ece6a,spinner:#9ece6a,header:#9ece6a"

Write-Host "fzf aliases loaded: fmig fbr fpg fsvc fcmp fhk ftyp fgrp frec" -ForegroundColor DarkGray
