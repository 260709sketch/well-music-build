// with-flac-converter.js —— Expo config plugin
// 在 prebuild 阶段注入 FLAC 转 PCM 原生模块：
//   1. 把 FLACConverter.m 复制进 ios/<app>/ 并加入 Xcode 编译源
//   2. 链接 AVFoundation 系统框架
const { withXcodeProject } = require('@expo/config-plugins')
const {
  addFramework,
  addBuildSourceFileToGroup,
} = require('@expo/config-plugins/build/ios/utils/Xcodeproj')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

module.exports = function withFLACConverter(config) {
  return withXcodeProject(config, async (config) => {
    const project = config.modResults
    const projectName = config.modRequest.projectName
    const platformRoot = config.modRequest.platformProjectRoot
    const appDir = path.join(platformRoot, projectName)

    if (!projectName) {
      throw new Error('[with-flac-converter] cannot resolve app target name')
    }

    // 1) FLACConverter.m → 编译源
    const srcFile = path.join(ROOT, 'assets', 'ios', 'FLACConverter.m')
    if (fs.existsSync(srcFile)) {
      fs.copyFileSync(srcFile, path.join(appDir, 'FLACConverter.m'))
      addBuildSourceFileToGroup({
        filepath: `${projectName}/FLACConverter.m`,
        groupName: projectName,
        project,
        verbose: true,
      })
      console.log(`[with-flac-converter] added FLACConverter.m to ${projectName} target`)
    } else {
      console.warn('[with-flac-converter] FLACConverter.m not found, skip')
    }

    // 2) 链接 AVFoundation 框架
    try {
      addFramework({ project, projectName, framework: 'AVFoundation.framework' })
      console.log('[with-flac-converter] linked AVFoundation.framework')
    } catch (e) {
      console.warn('[with-flac-converter] addFramework AVFoundation warn:', e.message)
    }

    return config
  })
}
