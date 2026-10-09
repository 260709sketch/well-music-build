// with-bluetooth-auto-pause.js —— Expo config plugin
// 在 prebuild 阶段注入「断蓝牙/拔耳机自动暂停」原生模块：
//   1. 把 BluetoothAutoPause.m 复制进 ios/<app>/ 并加入 Xcode 编译源
//   2. 链接 AVFoundation 系统框架（与 region 变化监听所需）
const { withXcodeProject } = require('@expo/config-plugins')
const {
  addFramework,
  addBuildSourceFileToGroup,
} = require('@expo/config-plugins/build/ios/utils/Xcodeproj')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

module.exports = function withBluetoothAutoPause(config) {
  return withXcodeProject(config, async (config) => {
    const project = config.modResults
    const projectName = config.modRequest.projectName
    const platformRoot = config.modRequest.platformProjectRoot
    const appDir = path.join(platformRoot, projectName)

    if (!projectName) {
      throw new Error('[with-bluetooth-auto-pause] cannot resolve app target name')
    }

    // 1) BluetoothAutoPause.m → 编译源
    const srcFile = path.join(ROOT, 'assets', 'ios', 'BluetoothAutoPause.m')
    if (fs.existsSync(srcFile)) {
      fs.copyFileSync(srcFile, path.join(appDir, 'BluetoothAutoPause.m'))
      addBuildSourceFileToGroup({
        filepath: `${projectName}/BluetoothAutoPause.m`,
        groupName: projectName,
        project,
        verbose: true,
      })
      console.log(`[with-bluetooth-auto-pause] added BluetoothAutoPause.m to ${projectName} target`)
    } else {
      console.warn('[with-bluetooth-auto-pause] BluetoothAutoPause.m not found, skip')
    }

    // 2) 链接 AVFoundation 框架
    try {
      addFramework({ project, projectName, framework: 'AVFoundation.framework' })
      console.log('[with-bluetooth-auto-pause] linked AVFoundation.framework')
    } catch (e) {
      console.warn('[with-bluetooth-auto-pause] addFramework AVFoundation warn:', e.message)
    }

    return config
  })
}