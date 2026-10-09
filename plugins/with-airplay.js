// with-airplay.js —— Expo config plugin
// 注入 iOS AirPlay 路由选择按钮（MPVolumeView）：
//   1. 复制 WellMusicAirPlayView(.h/.m) 与 Manager(.h/.m) 到 ios/<app>/
//   2. 把 .m 文件加入 Xcode 编译源
//   3. 链接 MediaPlayer 系统框架
const { withXcodeProject } = require('@expo/config-plugins')
const {
  addBuildSourceFileToGroup,
  addFramework,
} = require('@expo/config-plugins/build/ios/utils/Xcodeproj')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

const NATIVE_FILES = [
  'WellMusicAirPlayView.h',
  'WellMusicAirPlayView.m',
  'WellMusicAirPlayViewManager.h',
  'WellMusicAirPlayViewManager.m',
]

module.exports = function withAirPlay(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults
    const projectName = config.modRequest.projectName
    if (!projectName) {
      console.warn('[with-airplay] cannot resolve app target name, skip')
      return config
    }

    const appDir = path.join(config.modRequest.platformProjectRoot, projectName)

    for (const f of NATIVE_FILES) {
      const src = path.join(ROOT, 'assets', 'ios', f)
      if (!fs.existsSync(src)) {
        console.warn(`[with-airplay] ${f} not found, skip`)
        continue
      }
      fs.copyFileSync(src, path.join(appDir, f))
      if (f.endsWith('.m')) {
        addBuildSourceFileToGroup({
          filepath: `${projectName}/${f}`,
          groupName: projectName,
          project,
          verbose: true,
        })
        console.log(`[with-airplay] added ${f} to ${projectName} target`)
      }
    }

    try {
      addFramework({ project, projectName, framework: 'AVKit.framework' })
      console.log('[with-airplay] linked AVKit.framework')
    } catch (e) {
      console.warn('[with-airplay] addFramework AVKit warn:', e.message)
    }

    return config
  })
}
