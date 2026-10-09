// postinstall 补丁：从 react-native-image-colors 摘除 SwiftDraw 依赖
// SwiftDraw 0.27 声明 Swift 6.0，GitHub Actions 的 Xcode 15.4 只支持到 Swift 5.0，编译必挂
// 而 SwiftDraw 仅用于 data:image/svg 取色分支（本项目用不到），直接移除最干净
const fs = require('fs')
const path = require('path')

const moduleDir = path.join(__dirname, '..', 'node_modules', 'react-native-image-colors')

const podspecPath = path.join(moduleDir, 'ios', 'ImageColors.podspec')
const swiftPath = path.join(moduleDir, 'ios', 'ImageColorsModule.swift')

let changed = false

if (fs.existsSync(podspecPath)) {
  let spec = fs.readFileSync(podspecPath, 'utf8')
  const depLine = "  s.dependency 'SwiftDraw', '~> 0.27'\n"
  if (spec.includes(depLine)) {
    spec = spec.replace(depLine, '')
    fs.writeFileSync(podspecPath, spec, 'utf8')
    console.log('[patch] ImageColors.podspec: removed SwiftDraw dependency')
    changed = true
  }
} else {
  console.log('[patch] podspec not found, skipping:', podspecPath)
}

if (fs.existsSync(swiftPath)) {
  let swift = fs.readFileSync(swiftPath, 'utf8')
  if (swift.includes('import SwiftDraw')) {
    swift = swift.replace('import SwiftDraw\n', '')
    console.log('[patch] ImageColorsModule.swift: removed import SwiftDraw')
    changed = true
  }
  // 删除 data:image/svg 分支（依赖 SwiftDraw 的 SVG 解析）
  const svgBlock = swift.match(/            if uri\.hasPrefix\("data:image\/svg"\) \{[\s\S]*?\n            \}\n\n/)
  if (svgBlock) {
    swift = swift.replace(svgBlock[0], '')
    console.log('[patch] ImageColorsModule.swift: removed SVG branch')
    changed = true
  }
  if (changed) {
    fs.writeFileSync(swiftPath, swift, 'utf8')
  }
} else {
  console.log('[patch] swift module not found, skipping:', swiftPath)
}

if (!changed) {
  console.log('[patch] image-colors already patched or missing, skip')
}
