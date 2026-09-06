# Switch git branches with commit history preview
# Usage: .\fzf-branch.ps1
# Requirements: fzf (winget install junegunn.fzf)

$branches = git branch --all --format='%(refname:short)' 2>$null
if (-not $branches) {
    Write-Host "Not a git repository or no branches found." -ForegroundColor Red
    exit 1
}

$currentBranch = git branch --show-current

$branch = $branches |
    fzf --preview "git log --oneline --graph --color=always -20 {}" `
        --header "Current: $currentBranch  |  Select branch to switch" `
        --height 80% `
        --layout reverse `
        --border rounded `
        --preview-window "right:55%:wrap" `
        --pointer ">" `
        --prompt "branch> "

if ($branch) {
    $branch = $branch.Trim()
    # Strip origin/ prefix for remote branches
    if ($branch -match "^origin/(.+)$") {
        $localName = $Matches[1]
        $existsLocally = git branch --list $localName
        if (-not $existsLocally) {
            Write-Host "Creating local branch '$localName' tracking '$branch'" -ForegroundColor Yellow
            git checkout -b $localName $branch
        } else {
            git checkout $localName
        }
    } else {
        git checkout $branch
    }
}
