$content = Get-Content -Raw "src/features/analytics/components/AnalyticsWorkspace.tsx"
$old = "               </div>" + "`r`n" + "             )}" + "`r`n" + "`r`n" + "            {/* TAB: HEATMAP"
$new = "               </div>" + "`r`n" + "`r`n" + "            {/* TAB: HEATMAP"
$content = $content -replace [regex]::Escape($old), $new
Set-Content -Path "src/features/analytics/components/AnalyticsWorkspace.tsx" -Value $content -Encoding utf8
Write-Host "Done"