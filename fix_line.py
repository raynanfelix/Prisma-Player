import re

with open("src/features/analytics/components/AnalyticsWorkspace.tsx", "r", encoding="utf-8") as f:
    lines = f.readlines()

# Find the extra </div> line (line 1007 in 1-indexed)
# Remove the line that's just "               </div>" between ")}" and the comment
new_lines = []
skip_next = False
for i, line in enumerate(lines):
    # Check if this is the problematic line: just </div> followed by empty line then comment
    if i > 0 and line.strip() == '</div>' and i + 1 < len(lines):
        prev_line = lines[i-1].rstrip()
        next_line = lines[i+1].strip() if i + 1 < len(lines) else ''
        # Check if previous line ends with ")}" and next line is empty or comment
        if prev_line.endswith(')}') and (next_line == '' or next_line.startswith('{/*')):
            print(f"Removing line {i+1}: {line.strip()}")
            continue
    new_lines.append(line)

with open("src/features/analytics/components/AnalyticsWorkspace.tsx", "w", encoding="utf-8") as f:
    f.writelines(new_lines)

print("Done")