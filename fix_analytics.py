import re

with open("src/features/analytics/components/AnalyticsWorkspace.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Remove maxBarSize={30} from ComposedChart
content = content.replace('maxBarSize={30}\n', '')

# 2. Remove SeriesBar line
content = content.replace('<SeriesBar dataKey="viewers" name="Espectadores" color={CHART_SERIES_COLORS[0]} />\n', '')

# 3. Remove the entire table section (from <div className="overflow-x-auto... to </div>\n                  )}
# Find the table section and remove it
table_pattern = r'                  <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-zinc-800">\s*<table className="w-full min-w-\[600px\] text-left text-xs font-medium text#\[191A23\] dark:text-zinc-200">.*?</table>\s*</div>\s*              \)\s*'
content = re.sub(table_pattern, '', content, flags=re.DOTALL)

# 4. Remove the extra closing div that was causing the build error
# The pattern: ")}               </div>\n            )}" -> ")}"
content = content.replace(')}               </div>\n            )}', ')}')

with open("src/features/analytics/components/AnalyticsWorkspace.tsx", "w", encoding="utf-8") as f:
    f.write(content)

print("Done")