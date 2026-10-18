$content = Get-Content -Raw "src/features/analytics/components/AnalyticsWorkspace.tsx"
$content = $content -replace '\)\}\s+\{/\* TAB: HEATMAP', '{/* TAB: HEATMAP'
Set-Content -Path "src/features/analytics/components/AnalyticsWorkspace.tsx" -Value $content -Encoding utf8
Write-Host "Done"