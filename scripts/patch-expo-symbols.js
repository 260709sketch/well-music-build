// postinstall 补丁：为 expo-symbols 补齐 size prop 与正确的渲染方式，
// 修复图标变蓝（tint 未生效回落到系统蓝）与变形（原生恒 17pt 渲染 + scaleToFill 拉伸）
const fs = require('fs')
const path = require('path')

const moduleSwift = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-symbols',
  'ios',
  'SymbolModule.swift',
)
const viewSwift = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-symbols',
  'ios',
  'SymbolView.swift',
)

// ---- 1. SymbolModule.swift：注册 size prop ----
if (fs.existsSync(moduleSwift)) {
  let src = fs.readFileSync(moduleSwift, 'utf8')
  if (src.includes('Prop("size")')) {
    console.log('[patch-expo-symbols] SymbolModule.swift already patched, skip')
  } else {
    const anchor = '      Prop("name") { (view, name: String) in\n        view.name = name\n      }'
    if (!src.includes(anchor)) {
      console.error('[patch-expo-symbols] SymbolModule.swift anchor not found')
      process.exit(1)
    }
    const insert =
      '      Prop("size") { (view, size: Double) in\n        view.pointSize = CGFloat(size)\n      }\n\n'
    src = src.replace(anchor, anchor + '\n' + insert)
    fs.writeFileSync(moduleSwift, src, 'utf8')
    console.log('[patch-expo-symbols] SymbolModule.swift patched (size prop)')
  }
} else {
  console.error('[patch-expo-symbols] SymbolModule.swift not found')
  process.exit(1)
}

// ---- 2. SymbolView.swift：pointSize + aspectFit + tint 双保险 ----
if (fs.existsSync(viewSwift)) {
  let src = fs.readFileSync(viewSwift, 'utf8')
  if (src.includes('var pointSize: CGFloat = 17')) {
    console.log('[patch-expo-symbols] SymbolView.swift already patched, skip')
  } else {
    // a) 新增 pointSize 属性（插在 tint 属性声明前）
    const tintAnchor = '  var tint: UIColor?\n'
    if (!src.includes(tintAnchor)) {
      console.error('[patch-expo-symbols] SymbolView.swift tint anchor not found')
      process.exit(1)
    }
    src = src.replace(tintAnchor, tintAnchor + '  var pointSize: CGFloat = 17\n')

    // b) 默认 contentMode 改为 scaleAspectFit，杜绝拉伸变形
    const contentAnchor = '  var imageContentMode: UIView.ContentMode = .scaleToFill\n'
    if (!src.includes(contentAnchor)) {
      console.error('[patch-expo-symbols] SymbolView.swift contentMode anchor not found')
      process.exit(1)
    }
    src = src.replace(contentAnchor, '  var imageContentMode: UIView.ContentMode = .scaleAspectFit\n')

    // c) tint 双保险：同时设置 imageView.tintColor，避免回落到系统蓝
    const tintBlock = '    if let tint {\n      if symbolType != .hierarchical {\n        imageView.image = image.withTintColor(tint, renderingMode: .alwaysOriginal)\n      }\n    }\n'
    if (!src.includes(tintBlock)) {
      console.error('[patch-expo-symbols] SymbolView.swift tint block not found')
      process.exit(1)
    }
    const newTintBlock =
      '    if let tint {\n      imageView.tintColor = tint\n      if symbolType != .hierarchical {\n        imageView.image = image.withTintColor(tint, renderingMode: .alwaysOriginal)\n      }\n    } else {\n      imageView.tintColor = nil\n    }\n'
    src = src.replace(tintBlock, newTintBlock)

    // d) 图标渲染尺寸使用 pointSize（而非固定 17pt），并显式指定 scale/weight
    const configAnchor = '    var config = UIImage.SymbolConfiguration(pointSize: UIFont.systemFontSize, weight: weight, scale: scale)\n'
    if (!src.includes(configAnchor)) {
      console.error('[patch-expo-symbols] SymbolView.swift config anchor not found')
      process.exit(1)
    }
    src = src.replace(configAnchor, '    var config = UIImage.SymbolConfiguration(pointSize: pointSize, weight: weight, scale: scale)\n')

    fs.writeFileSync(viewSwift, src, 'utf8')
    console.log('[patch-expo-symbols] SymbolView.swift patched (pointSize/aspectFit/tint)')
  }
} else {
  console.error('[patch-expo-symbols] SymbolView.swift not found')
  process.exit(1)
}

console.log('[patch-expo-symbols] done')
