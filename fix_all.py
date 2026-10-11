import re

# Fix VslStudio.tsx
path = 'src/features/studio/components/VslStudio.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix setHookPresets type
content = content.replace(
    'setHookPresets?.((prev) =>',
    'setHookPresets?.((prev: PresetCardItem[]) =>'
)
content = content.replace(
    'prev.map((p, i) => ({ ...p, badge: i === idx ? "Ativo" : undefined }))',
    'prev.map((p: PresetCardItem, i: number) => ({ ...p, badge: i === idx ? "Ativo" : undefined }))'
)

# Fix setCtaPresets type
content = content.replace(
    'setCtaPresets?.((prev) =>',
    'setCtaPresets?.((prev: PresetCardItem[]) =>'
)

# Fix setThumbnailPresets type
content = content.replace(
    'setThumbnailPresets?.((prev) =>',
    'setThumbnailPresets?.((prev: PresetCardItem[]) =>'
)

# Fix setLearnModule in renderPanel - use extras
content = content.replace(
    '        <button type="button" onClick={() => setLearnModule("hooks")}',
    '        <button type="button" onClick={() => extras?.setLearnModule("hooks")}'
)
content = content.replace(
    '        <button type="button" onClick={() => setLearnModule("actions")}',
    '        <button type="button" onClick={() => extras?.setLearnModule("actions")}'
)
content = content.replace(
    '        <button type="button" onClick={() => setLearnModule("thumbnail")}',
    '        <button type="button" onClick={() => extras?.setLearnModule("thumbnail")}'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('VslStudio fixed')

# Fix AnalyticsWorkspace.tsx
path2 = 'src/features/analytics/components/AnalyticsWorkspace.tsx'
with open(path2, 'r', encoding='utf-8') as f:
    content2 = f.read()

# Remove any remaining sidebar references if they cause errors
# The sidebar was already removed, just need to check imports
print('AnalyticsWorkspace ready')

print('Done')
