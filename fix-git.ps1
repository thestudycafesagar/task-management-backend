# Fix git and push changes
Write-Host "Removing tracked env files..." -ForegroundColor Yellow
git rm --cached .env.production .env.render 2>$null

Write-Host "Adding changes..." -ForegroundColor Yellow
git add -A

Write-Host "Committing..." -ForegroundColor Yellow
git commit -m "chore: update gitignore and remove env files from tracking"

Write-Host "Force pushing to remote..." -ForegroundColor Yellow
git push origin main --force

Write-Host "Done!" -ForegroundColor Green
