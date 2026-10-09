// with-lx-user-api.js —— Expo config plugin
// 在 prebuild 阶段注入 lx 音源实现：
//   1. 把 WellMusicUserApi.mm 复制进 ios/<app>/ 并加入 Xcode 编译源
//   2. 把 user-api-preload.js 加入 Xcode Copy Bundle Resources
//   3. 链接 Security / JavaScriptCore 系统框架
const { withXcodeProject } = require('@expo/config-plugins')
const {
  addFramework,
  addBuildSourceFileToGroup,
} = require('@expo/config-plugins/build/ios/utils/Xcodeproj')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

/**
 * 把资源文件可靠地加入 Xcode 工程的 Copy Bundle Resources build phase。
 * Expo 内置的 addResourceFileToGroup 只加入文件引用和 group，
 * 不会自动加入 build phase，导致资源最终不在 app bundle 里。
 * 这里直接调用 xcode 库原生的 addResourceFile，一步到位。
 */
function addResourceToBundle(project, filepath, projectName) {
  // xcode 库的 build phase 相关 API 需要 target 的 UUID（PBXNativeTarget 的 key），
  // 传 target 名称会抛 "Invalid target: <name>"。先通过 findTargetKey 拿到 UUID。
  const targetUuid = project.findTargetKey(projectName)
  if (!targetUuid) {
    console.warn(`[with-lx-user-api] cannot find target ${projectName}`)
    return false
  }
  // 确认 target 的 Resources build phase 存在（同时验证 target 有效）
  const resourcesPhase = project.pbxResourcesBuildPhaseObj(targetUuid)
  if (!resourcesPhase) {
    console.warn('[with-lx-user-api] PBXResourcesBuildPhase not found')
    return false
  }
  // 手工构造 PBXFile 并加入各 section（等价于 xcode 库 addResourceFile 的核心逻辑，
  // 但绕开其内部对 Resources group 的隐式依赖，避免在无该 group 的工程上崩溃）
  const pbxFile = require('xcode/lib/pbxFile')
  // lastKnownFileType='text' 让 fileEncoding 正确设为 4，避免 undefined 写入 pbxproj
  const file = new pbxFile(filepath, { lastKnownFileType: 'text' })
  file.target = targetUuid
  delete file.explicitFileType
  if (project.hasFile(file.path)) {
    console.log(`[with-lx-user-api] resource already exists: ${filepath}`)
    return true
  }
  file.uuid = project.generateUuid()
  file.fileRef = project.generateUuid()
  project.addToPbxBuildFileSection(file) // PBXBuildFile
  project.addToPbxResourcesBuildPhase(file) // 加入 Copy Bundle Resources
  project.addToPbxFileReferenceSection(file) // PBXFileReference
  const resourcesGroupKey = project.findPBXGroupKey({ name: 'Resources' })
  if (resourcesGroupKey) project.addToPbxGroup(file, resourcesGroupKey)
  console.log(`[with-lx-user-api] added ${filepath} to Copy Bundle Resources`)
  return true
}

module.exports = function withLxUserApi(config) {
  return withXcodeProject(config, async (config) => {
    const project = config.modResults
    const projectName = config.modRequest.projectName // app target 名（如 WellMusic）
    const platformRoot = config.modRequest.platformProjectRoot // <root>/ios
    const appDir = path.join(platformRoot, projectName)

    if (!projectName) {
      throw new Error('[with-lx-user-api] cannot resolve app target name')
    }

    // 1) WellMusicUserApi.mm → 编译源
    const srcMm = path.join(ROOT, 'assets', 'ios', 'WellMusicUserApi.mm')
    if (fs.existsSync(srcMm)) {
      fs.copyFileSync(srcMm, path.join(appDir, 'WellMusicUserApi.mm'))
      addBuildSourceFileToGroup({
        filepath: `${projectName}/WellMusicUserApi.mm`,
        groupName: projectName,
        project,
        verbose: true,
      })
      console.log(`[with-lx-user-api] added WellMusicUserApi.mm to ${projectName} target`)
    } else {
      console.warn('[with-lx-user-api] WellMusicUserApi.mm not found, skip')
    }

    // 2) user-api-preload.js → Copy Bundle Resources
    const srcPreload = path.join(ROOT, 'assets', 'ios', 'user-api-preload.js')
    if (fs.existsSync(srcPreload)) {
      const destPreload = path.join(appDir, 'user-api-preload.js')
      fs.copyFileSync(srcPreload, destPreload)
      const ok = addResourceToBundle(project, `${projectName}/user-api-preload.js`, projectName)
      if (!ok) {
        throw new Error('[with-lx-user-api] failed to add user-api-preload.js to bundle resources')
      }
    } else {
      console.warn('[with-lx-user-api] user-api-preload.js not found, skip')
    }

    // 3) 链接系统框架
    for (const framework of ['Security.framework', 'JavaScriptCore.framework']) {
      try {
        addFramework({ project, projectName, framework })
        console.log(`[with-lx-user-api] linked ${framework}`)
      } catch (e) {
        console.warn(`[with-lx-user-api] addFramework ${framework} warn:`, e.message)
      }
    }

    return config
  })
}
