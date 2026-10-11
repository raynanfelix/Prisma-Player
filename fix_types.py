with open('src/features/studio/components/VslStudio.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix setHookPresets type
old1 = '''                    setHookPresets?.((prev) =>
                      prev.map((p, i) => ({ ...p, badge: i === idx ? "Ativo" : undefined }))
                    );'''
new1 = '''                    setHookPresets?.((prev: PresetCardItem[]) =>
                      prev.map((p: PresetCardItem, i: number) => ({ ...p, badge: i === idx ? "Ativo" : undefined }))
                    );'''
if old1 in content:
    content = content.replace(old1, new1)
    print('Fixed setHookPresets')
else:
    print('setHookPresets pattern not found')

# Fix setCtaPresets type
old2 = '''                    setCtaPresets?.((prev) =>
                      prev.map((p, i) => ({ ...p, badge: i === idx ? "Ativo" : undefined }))
                    );'''
new2 = '''                    setCtaPresets?.((prev: PresetCardItem[]) =>
                      prev.map((p: PresetCardItem, i: number) => ({ ...p, badge: i === idx ? "Ativo" : undefined }))
                    );'''
if old2 in content:
    content = content.replace(old2, new2)
    print('Fixed setCtaPresets')
else:
    print('setCtaPresets pattern not found')

# Fix setThumbnailPresets type
old3 = '''                    setThumbnailPresets?.((prev) =>
                      prev.map((p, i) => ({ ...p, badge: i === idx ? "Ativo" : undefined }))
                    );'''
new3 = '''                    setThumbnailPresets?.((prev: PresetCardItem[]) =>
                      prev.map((p: PresetCardItem, i: number) => ({ ...p, badge: i === idx ? "Ativo" : undefined }))
                    );'''
if old3 in content:
    content = content.replace(old3, new3)
    print('Fixed setThumbnailPresets')
else:
    print('setThumbnailPresets pattern not found')

with open('src/features/studio/components/VslStudio.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')