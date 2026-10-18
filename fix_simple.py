import re

with open("src/features/analytics/components/AnalyticsWorkspace.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# Fix the extra closing brace
content = content.replace(
    ")}               </div>             )}            {/* TAB: HEATMAP",
    ")}               </div>            {/* TAB: HEATMAP"
)

with open("src/features/analytics/components/AnalyticsWorkspace.tsx", "w", encoding="utf-8") as f:
    f.write(content)
print("Done")