// with-sheet-modal.js —— Expo config plugin
// 注入 iOS 原生半屏弹窗（UISheetPresentationController）：
//   1. 复制 WellMusicSheetViewController(.h/.m) 与 Module(.h/.m) 到 ios/<app>/
//   2. 把 .m 文件加入 Xcode 编译源
const { withXcodeProject } = require('@expo/config-plugins')
const {
  addBuildSourceFileToGroup,
} = require('@expo/config-plugins/build/ios/utils/Xcodeproj')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

const NATIVE_FILES = [
  'WellMusicSheetViewController.h',
  'WellMusicSheetViewController.m',
  'WellMusicSheetModule.h',
  'WellMusicSheetModule.m',
]

module.exports = function withSheetModal(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults
    const projectName = config.modRequest.projectName
    if (!projectName) {
      console.warn('[with-sheet-modal] cannot resolve app target name, skip')
      return config
    }

    const appDir = path.join(config.modRequest.platformProjectRoot, projectName)

    for (const f of NATIVE_FILES) {
      const src = path.join(ROOT, 'assets', 'ios', f)
      if (!fs.existsSync(src)) {
        console.warn(`[with-sheet-modal] ${f} not found, skip`)
        continue
      }
      fs.copyFileSync(src, path.join(appDir, f))
      if (f.endsWith('.m')) {
        try {
          addBuildSourceFileToGroup({
            filepath: `${projectName}/${f}`,
            groupName: projectName,
            project,
            verbose: true,
          })
          console.log(`[with-sheet-modal] added ${f} to ${projectName} target`)
        } catch (e) {
          console.warn(`[with-sheet-modal] failed to add ${f}: ${e.message}`)
        }
      }
    }

    return config
  })
}
