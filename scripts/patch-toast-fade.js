// postinstall 补丁：react-native-toast-message 提示改为纯淡入淡出
// 原实现 translateY 从 -2倍高度 弹入、消失再弹回（用户反馈难受），
// 将 translateY 输出范围固定为常驻位置，只保留 opacity 动画 → 原地淡入淡出
const fs = require('fs')
const path = require('path')

const target = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-toast-message',
  'lib',
  'src',
  'hooks',
  'useSlideAnimation.js',
)

if (!fs.existsSync(target)) {
  console.error('[patch-toast-fade] useSlideAnimation.js not found')
  process.exit(1)
}

let src = fs.readFileSync(target, 'utf8')
if (src.includes('WellMusic fade-only toast')) {
  console.log('[patch-toast-fade] already patched, skip')
  process.exit(0)
}

const oldFn = `export function translateYOutputRangeFor({ position, height, topOffset, bottomOffset, keyboardHeight, keyboardOffset, avoidKeyboard }) {
    const offset = position === 'bottom' ? bottomOffset : topOffset;
    const keyboardAwareOffset = position === 'bottom' && avoidKeyboard ? keyboardHeight + keyboardOffset : 0;
    const range = [-(height * 2), Math.max(offset, keyboardAwareOffset)];
    const outputRange = position === 'bottom' ? additiveInverseArray(range) : range;
    return outputRange;
}`

const newFn = `export function translateYOutputRangeFor({ position, topOffset, bottomOffset }) {
    // WellMusic fade-only toast: 位移固定为常驻位置，仅 opacity 做淡入淡出
    const resting = position === 'bottom' ? -bottomOffset : topOffset;
    return [resting, resting];
}`

if (!src.includes(oldFn)) {
  console.error('[patch-toast-fade] translateYOutputRangeFor anchor not found')
  process.exit(1)
}
src = src.replace(oldFn, newFn)
fs.writeFileSync(target, src, 'utf8')
console.log('[patch-toast-fade] patched (fade-only)')
