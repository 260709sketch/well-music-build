// postinstall 补丁：为 expo-share-intent 插件补齐 prebuild 时缺失的标准 Xcode 组
// expo SDK 50 生成的工程没有 Resources/Frameworks/Plugins 组，
// 而插件的 addResourceFile 会读取这些组，缺失时抛 "Cannot read properties of null (reading 'path')"
const fs = require('fs')
const path = require('path')

const target = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-share-intent',
  'plugin',
  'build',
  'ios',
  'withIosShareExtensionXcodeTarget.js',
)

if (!fs.existsSync(target)) {
  console.log('[patch] target not found, skipping:', target)
  process.exit(0)
}

const original = fs.readFileSync(target, 'utf8')
// 幂等：已打过补丁则跳过
if (original.includes('"Resources", "Frameworks", "Plugins"')) {
  console.log('[patch] expo-share-intent already patched, skip')
  process.exit(0)
}

const anchor = 'const target = pbxProject.addTarget(extensionName, "app_extension", extensionName);'
if (!original.includes(anchor)) {
  console.error('[patch] anchor not found, cannot patch:', anchor)
  process.exit(1)
}

const insert =
  '        // patched: expo SDK 50 prebuild missing standard groups\n' +
  '        ["Resources", "Frameworks", "Plugins"].forEach((groupName) => {\n' +
  '            if (!pbxProject.pbxGroupByName(groupName)) {\n' +
  '                pbxProject.pbxCreateGroup(groupName, groupName);\n' +
  '            }\n' +
  '        });\n'

const patched = original.replace(anchor, insert + anchor)
fs.writeFileSync(target, patched, 'utf8')
console.log('[patch] expo-share-intent patched OK')