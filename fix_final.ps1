$content = Get-Content -Raw "src/features/analytics/components/AnalyticsWorkspace.tsx"
# Find the exact problematic pattern and fix it
$content = $content -replace "`r`n             )}`r`n`r`n            {/* TAB: HEATMAP", "`r`n`r`n            {/* TAB: HEATMAP"
Set-Content -Path "src/features/analytics/components/AnalyticsWorkspace.tsx" -Value $content -Encoding utf8
Write-Host "Done"