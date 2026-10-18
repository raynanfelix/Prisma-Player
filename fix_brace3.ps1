$content = Get-Content -Raw "src/features/analytics/components/AnalyticsWorkspace.tsx"
$idx = $content.IndexOf("/* TAB: HEATMAP")
$before = $content.Substring(0, $idx)
$lastClose = $before.LastIndexOf(")}")
$new = $content.Substring(0, $lastClose + 2) + "`r`n`r`n            {/* TAB: HEATMAP" + $content.Substring($lastClose + 4)
Set-Content -Path "src/features/analytics/components/AnalyticsWorkspace.tsx" -Value $new -Encoding utf8
Write-Host "Done"