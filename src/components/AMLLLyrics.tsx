import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { amllHtmlContent } from './amllHtmlContent';
import PersistStatus from '@/store/PersistStatus';
import { useAMLLSettingsStore, type AMLLBackgroundMode, isStaticBackground } from '@/store/amllSettingsStore';
import LyricManager from '@/helpers/lyricManager';
import { stripLyricMetadataLines } from '@/utils/stripLyricMetadata';

export interface LyricWordData {
  start: number;
  end: number;
  text: string;
}
export interface LyricLineData {
  time: number;
  end?: number;
  lrc: string;
  index: number;
  words?: LyricWordData[];
  translatedLyric?: string;
}

interface Props {
  lyrics: LyricLineData[];
  currentTime: number;
  isPlaying: boolean;
  albumArt?: string;
  alignPosition?: number;
  fontSize?: number;
  inactiveFontSize?: number;
  fontWeight?: number;
  lineMargin?: number;
  lyricAreaTop?: number;
  lyricBottom?: number;
  lyricPaddingTop?: number;
  lyricPaddingLeft?: number;
  lyricPaddingRight?: number;
  lyricPaddingBottom?: number;
  lyricTextAlign?: 'left' | 'center' | 'right';
  backgroundMode?: AMLLBackgroundMode;
  showLyrics?: boolean;
  onSeek?: (time: number) => void;
  seekCommand?: { seq: number; time: number };
  onReady?: () => void;
  syncEnabled?: boolean;
  // 拖动进度条期间为 true：定时推送锁定目标时间让歌词跟手预览
  syncLocked?: boolean;
  // 拖动期间的锁定目标时间（秒）
  syncTime?: number;
  // 歌词时间微调（秒）：按当前歌曲记忆的有效偏移。传入时覆盖全局 lyric.delaySeconds；
  // 不传则回退全局值，保持对播放器外调用方（如 player.tsx 全屏 Lyric）向后兼容
  lyricDelay?: number;
}

const AMLLLyrics: React.FC<Props> = ({
  lyrics,
  currentTime,
  isPlaying,
  albumArt,
  alignPosition = 0.5,
  fontSize = 22,
  inactiveFontSize = 16,
  fontWeight = 600,
  lineMargin = 16,
  lyricAreaTop = 236,
  lyricBottom = 280,
  lyricPaddingTop = 0,
  lyricPaddingLeft = 0,
  lyricPaddingRight = 0,
  lyricPaddingBottom = 0,
  lyricTextAlign = 'left',
  backgroundMode = 'flowing',
  showLyrics = true,
  onSeek,
  seekCommand,
  onReady,
  syncEnabled = true,
  syncLocked = false,
  syncTime,
  lyricDelay,
}) => {
  const webViewRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  // 最近一次 seek 校准的墙钟时刻（ms）：seed 后（尤其无损）播放器会走 Buffering→Playing，
  // 此刻播放器真实位置 getPosition 存在系统级上报延迟。若恢复时用滞后的 currentTime
  // force 重锚引擎墙钟，会把歌词锚回偏后位置，导致"歌词与人声各跑各的"。
  // 因此在 seek 后短窗口内的恢复跳过重锚，让引擎墙钟从 seek 目标点继续推进。
  const lastSeekAtRef = useRef(0);
  // onReady 只应在首次就绪时触发一次，用 ref 避免闭包过期
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const lastSeekSeqRef = useRef(0);
  // 进度条同源时间：currentTime prop = 播放器 displayPosition（useProgress 派生）。
  // 歌词锚定必须与进度条取同一来源，否则切歌过渡期两个 getPosition/useProgress
  // 来源不齐，会出现"歌词跳到第一句而进度条还在旧位置"的错位。
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;
  const syncLockedRef = useRef(syncLocked);
  syncLockedRef.current = syncLocked;
  const syncTimeRef = useRef(syncTime);
  syncTimeRef.current = syncTime;
  // 锁定期间喂给引擎的目标时间（AMLL 时间），供锁释放时判断真实落点偏差
  const lastFedAmllRef = useRef<number | null>(null);
  // 上一次 syncLocked 状态，用于检测"锁刚释放"边缘
  const wasLockedRef = useRef(false);
  // 歌词字体设置
  const { lyricFont, heitiFontWeight, lyricPerf, lyricFontWeight } = useAMLLSettingsStore();
  // 实际生效的字重：黑体模式用黑体字重，否则用设置里用户可调的「歌词字重」（默认中等 600），`fontWeight` 仅作兜底
  const effectiveFontWeight = lyricFont === 'heiti' ? heitiFontWeight : (lyricFontWeight ?? fontWeight);

  // 移植自 SPlayer-Next / lyric-kit 的 stripLyricMetadata：用 useMemo 剔除歌词头尾/间插的
  // 制作信息、版权水印、职务 Credit 等非演唱行，只影响展示层，不改动时间轴与同步逻辑。
  const filteredLyrics = useMemo(() => stripLyricMetadataLines(lyrics), [lyrics]);

  // ---- 引擎内置墙钟时钟（真病根的唯一正解）----
  // 关键勘误：官方 AMLL 引擎（amllHtmlContent.ts 里的 qu/Ku/setTime）自身就是一个
  // 精确的墙钟时钟：
  //   setPlaying(true) 后，页面在 requestAnimationFrame 里执行
  //   Ku += (当前帧时间戳 - 上一帧时间戳)   // 累加真实流逝的墙钟秒数
  //   Ru.setCurrentTime(Ku*1000)          // 每帧把累加值喂给歌词渲染器
  // 由于 RAF 的帧时间戳取自真实时间（与音频采样时钟同源），Ku 天生跟歌曲播放同步，
  // 与音质（MP3/FLAC/无损/Hi-Res）无关。setTime(e, false) 只是"外部微调/校正"：
  //   - e 落后引擎时钟 > 0.25s：force 采纳（用于校正漂移/seek）
  //   - e 领先引擎时钟：仅把 Ku 更新为 e（不 force，供外部覆盖）
  // 我们此前的致命错误：用 100ms 的 setInterval 每 100ms 喂一次 setTime(x,false)，
  // 等于在每一帧都暴力改写/覆盖引擎本来就精确的墙钟 Ku → 反而把时钟搞乱，
  // 尤其无损播放时 WebView 的 RAF 帧间隔不恒定，喂入的值反复破坏它 → "歌词与人声
  // 各跑各的"。这正是用户"极高音质同步、FLAC 以上不同步"的真正根源（不是内核，
  // 是我们错误地持续干涉了引擎时钟）。
  // 正确做法（照搬 SPlayer-Next / Sollin）：让引擎自有的墙钟时钟自由运行，外部
  // 只在关键时刻用 force（setTime(e,true)）精确定位，绝不 100ms 高频喂 false。
  // （以下 ref 仅为兼容旧调用保留，引擎内置墙钟时钟才是同步的来源，本地时钟不再推进歌词）
  const baseTimeMsRef = useRef(0);
  const lastSyncAtRef = useRef(0);
  const anchorClock = (ms: number) => {
    baseTimeMsRef.current = ms;
    lastSyncAtRef.current = performance.now();
  };

  // 传给 AMLL 的时间 = 播放器时间 + 歌词偏移。
  // 优先用按歌曲记忆的偏移（lyricDelay），未传入则回退全局 lyric.delaySeconds。
  const effectiveDelay = lyricDelay !== undefined ? lyricDelay : (PersistStatus.get('lyric.delaySeconds') ?? 0);
  const getAmllTime = (t: number) => t + effectiveDelay;

  // 应用背景模式：把业务档位映射成 AMLL 引擎的 static/flowing；
  // Apple Music 预设档（appleMusicDynamic / appleMusicStatic）额外把背景内部参数调到该预设的 BackgroundRender 档
  const applyBackgroundMode = useCallback((mode: AMLLBackgroundMode | undefined) => {
    const engineMode = mode ? (isStaticBackground(mode) ? 'static' : 'flowing') : 'flowing';
    let js = `if(typeof window.amll.setBackgroundMode==='function'){window.amll.setBackgroundMode('${engineMode}')}`;
    if (mode === 'appleMusicDynamic' || mode === 'appleMusicStatic') {
      // Apple Music 播放器背景预设档：fps18 / renderScale0.36 / flowSpeed0.72
      js += `;if(typeof window.amll.setBackgroundTune==='function'){window.amll.setBackgroundTune({fps:18,renderScale:0.36,flowSpeed:0.72})}`;
    }
    inject(js + '; true;');
    // Apple Music 预设覆盖层：径向渐变 + 18% 黑色压暗
    inject(`
      (function(){
        var isAmPreset = '${mode}'.indexOf('appleMusic') === 0;
        var ov = document.getElementById('sollin-overlay');
        if (isAmPreset) {
          if (!ov) {
            ov = document.createElement('div');
            ov.id = 'sollin-overlay';
            ov.style.cssText = 'position:absolute;inset:0;z-index:1;pointer-events:none;' +
              'background:radial-gradient(circle at center, rgba(255,255,255,0.04), rgba(3,7,12,0.64) 72%, rgba(0,0,0,0.82) 100%);';
            var bg = document.getElementById('bg');
            if (bg) bg.appendChild(ov);
            var sp = document.createElement('div');
            sp.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.18)';
            ov.appendChild(sp);
          }
        } else if (ov) {
          ov.remove();
        }
      })();
      true;
    `);
  }, [inject]);

  // 强制把引擎锚定到指定 AMLL 时间（setTime(e,true)：引擎精确跳转并以其为墙钟基准继续推进）
  const forceSetTime = useCallback((amllSec: number) => {
    inject(`window.amll.setTime(${amllSec}, true); true;`);
  }, []);

  // 向 WebView 注入 JS
  const inject = (code: string) => {
    webViewRef.current?.injectJavaScript(code);
  };

  // ---- 应用歌词容器布局和字重 ----
  const applyLyricLayout = () => {
    inject(`
      (function() {
        var el = document.getElementById('lyrics');
        if (el) {
          el.style.top = '${lyricAreaTop}px';
          el.style.bottom = '${lyricBottom + lyricPaddingBottom}px';
          el.style.paddingTop = '${lyricPaddingTop}px';
          el.style.paddingLeft = '${lyricPaddingLeft}px';
          el.style.paddingRight = '${lyricPaddingRight}px';
          el.style.paddingBottom = '0px';
          el.style.textAlign = '${lyricTextAlign}';
          el.style.opacity = '${showLyrics ? '1' : '0'}';
          el.style.pointerEvents = '${showLyrics ? 'auto' : 'none'}';
          el.style.overflow = 'hidden';
        }
        var styleId = 'amll-fw-override';
        var oldStyle = document.getElementById(styleId);
        if (oldStyle) oldStyle.remove();
        // 按 Kumone 结构分头控制字重：主句行用配置字重（默认 700 -> 编译期 @font-face 651-900 段 -> PingFang Semibold），
        // 翻译行固定 500。仅改 font-weight 不会真正变字重，
        // 需配合编译期 amllHtmlContent 内的 @font-face 分段映射到真实 PingFang 字形。
        var css = '[class*="lyricMainLine"],[class*="lyricLine"]{font-weight:${effectiveFontWeight} !important}' +
                  '[class*="lyricSubLine"]{font-weight:500 !important}';
        var style = document.createElement('style');
        style.id = styleId;
        style.textContent = css;
        document.head.appendChild(style);
      })();
      true;
    `);
  };

  // WebView 就绪后统一初始化
  const initAmll = () => {
    // 应用歌词渲染性能项（fps/blur/scale/spring/hidePassed，默认=现状锁 80 帧）
    inject(`window.amll.setLyricPerf(${JSON.stringify(lyricPerf)}); true;`);
    if (albumArt) inject(`window.amll.setAlbum(${JSON.stringify(albumArt)}); true;`);
    // amll.html 背景引擎默认基于专辑图做动态模糊背景。setBackgroundMode/桌面参数档必须防护，
    // 否则在含该方法不存在的引擎片段上 inject 到不存在的属性会抛 TypeError。
    applyBackgroundMode(backgroundMode);
    inject(`window.amll.setPlaying(${isPlaying}); true;`);
    if (lyrics.length > 0) {
      inject(`window.amll.setLyrics(${JSON.stringify(filteredLyrics)}); true;`);
    }
    inject(`window.amll.setTime(${getAmllTime(currentTime)}, true); true;`);
    // 本地时钟基准与 AMLL 初始时间对齐，避免首次高频推送把歌词拉回 0
    anchorClock((currentTime ?? 0) * 1000);
    inject(`window.amll.setAlignPosition(${alignPosition}); true;`);
    inject(`window.amll.setFontStyle(${fontSize}, ${inactiveFontSize}, ${effectiveFontWeight}, ${lineMargin}); true;`);
    applyLyricLayout();
  };

  const handleLoadEnd = () => {
    if (!readyRef.current) {
      readyRef.current = true;
      initAmll();
      // onReady 不在 onLoadEnd 触发：HTML 加载完成时页面内 Pixi 引擎可能仍在初始化，
      // 此时通知会让兜底背景过早淡出导致黑屏。等页面内 JS 发来 ready 消息（引擎就绪）再通知。
    }
  };

  const handleMessage = (e: any) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'ready') {
        // 页面内引擎就绪（load+100ms 发送）。无论 handleLoadEnd 是否已初始化，
        // 都重跑 initAmll（幂等）确保歌词/封面/时间注入不丢失，并通知兜底淡出
        readyRef.current = true;
        initAmll();
        onReadyRef.current?.();
      } else if (msg.type === 'seek') {
        // 点击歌词：先让 AMLL 立即跳转，再让播放器 seek
        inject(`window.amll.setTime(${msg.time}, true); true;`);
        const realTime = msg.time - effectiveDelay;
        onSeek?.(realTime);
        // 1.5 秒后清除选中状态
        setTimeout(() => {
          inject(`
            (function() {
              if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
              var lines = document.querySelectorAll('[class*="lyricLineWrapper"]');
              for (var i = 0; i < lines.length; i++) {
                lines[i].blur && lines[i].blur();
                lines[i].classList.remove('active', 'selected', 'pressed');
              }
            })();
            true;
          `);
        }, 1500);
      }
    } catch {}
  };

  // 歌词更新（切歌等）：更新歌词并 force 对齐到当前播放位置。
  // 锚定基准用 currentTimeRef（与进度条同源的 displayPosition），不另读 getPosition()，
  // 这样切歌过渡期歌词与进度条始终来自同一时钟源。force（setTime(e,true)）后引擎会
  // Ru.setTime(e*1000,true) 精确跳转；此后引擎自带墙钟时钟继续推进，我们不再干预。
  // FLAC 切源期间跳过：同歌换源歌词数组不会真的变化（lyricManager 已拦截刷新），
  // 此时 force 重锚到滞后的 currentTime 会把引擎拉到第 0 句，正是"歌词重置"的病根。
  useEffect(() => {
    if (LyricManager.isSourceSwitching()) return;
    inject(`window.amll.setLyrics(${JSON.stringify(filteredLyrics)}); true;`);
    const base = currentTimeRef.current ?? 0;
    inject(`window.amll.setTime(${getAmllTime(base)}, true); true;`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lyrics]);

  // 歌词时间微调变化时，立即把引擎墙钟重锚到 播放器时间 + 新偏移（force），
  // 让用户调完马上看到效果
  const lastDelayRef = useRef(effectiveDelay);
  useEffect(() => {
    if (lastDelayRef.current === effectiveDelay) return;
    lastDelayRef.current = effectiveDelay;
    if (readyRef.current) {
      forceSetTime(getAmllTime(currentTimeRef.current ?? 0));
    }
  }, [effectiveDelay]);

  // ---- 引擎时钟自由运行，仅在拖动进度条锁定期间推预览值 ----
  // 注意：绝不 100ms 高频喂 setTime(false)——那会每秒反复覆盖引擎本来就精确的
  // 墙钟 Ku，是无损音质歌词与人声脱节的真正根源。正常播放完全不喂 time，
  // 引擎 requestAnimationFrame 自己的 Ku += 帧时间戳差 就与音频严格同步。
  // 拖动锁定时（syncLocked）才需要高频推送锁定目标值，让歌词跟手预览。
  useEffect(() => {
    let stopped = false;
    let lastSwitchingState = false;
    const id = setInterval(() => {
      if (stopped) return;
      // FLAC 切源结束边缘：单次 force 重锚引擎到真实落点，校正切换期的墙钟漂移。
      // 延迟清除的 isSwitchingSource 在切换完成后约 800ms 变 false，此刻 useProgress
      // 已上报 seek 后的真实位置，重锚不会拉到 0/旧值；只会触发一次（边缘由
      // lastSwitchingState 记录，结束后再跑到此分支时两边都是 false）。
      const switching = LyricManager.isSourceSwitching();
      if (lastSwitchingState && !switching) {
        const landed = currentTimeRef.current ?? 0;
        webViewRef.current?.injectJavaScript(`window.amll.setTime(${getAmllTime(landed)}, true); true;`);
      }
      lastSwitchingState = switching;
      if (syncLockedRef.current && syncTimeRef.current != null) {
        const t = syncTimeRef.current;
        webViewRef.current?.injectJavaScript(`window.amll.setTime(${getAmllTime(t)}, false); true;`);
        // 记下锁定期间喂给引擎的目标时间（AMLL 时间），供锁释放时判断真实落点偏差
        lastFedAmllRef.current = getAmllTime(t);
      }
      // 未锁定时什么都不做，引擎墙钟时钟自行推进，与音频严格同步
    }, 100);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);

  // 播放状态：暂停/恢复。引擎 setPlaying 已天然处理 pause（Wu=false 冻结 Ku，暂停期间
  // 时钟停在原地）与 resume（Wu=true 继续累加墙钟）。我们仅在【从暂停恢复】时用进度条
  // 同源位置 force 一次，规避"暂停期间 seek 过导致引擎 Ku 与真实位置错位"的情况。
  // FLAC 切源期间跳过：切换瞬间 useProgress 的 position 还是 0/旧值（上报滞后约 200-400ms），
  // isPlaying 翻 true 时若强制重锚会把引擎拉到第 0 句 → 歌词重置。切源窗口内交给
  // pending 机制与 seekCommand 锚定，引擎墙钟从正确位置继续推进。
  useEffect(() => {
    inject(`window.amll.setPlaying(${isPlaying}); true;`);
    if (isPlaying) {
      // seek 后（尤其无损）恢复播放时，播放器真实位置 getPosition 上报有明显延迟，
      // 用滞后的 currentTime force 重锚会把歌词锚回偏后，与正在播放的声音脱节。
      // 此时应信任 range 已用 seekCommand setTime(target,true) 把引擎墙钟锚定到 seek 目标，
      // 跳过本次重锚，让引擎墙钟从该点继续推进（与音频采样时钟同源，天然同步）。
      const sinceSeek = Date.now() - lastSeekAtRef.current;
      if (sinceSeek < 2500 || LyricManager.isSourceSwitching()) {
        return;
      }
      const base = currentTimeRef.current ?? 0;
      inject(`window.amll.setTime(${getAmllTime(base)}, true); true;`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  // seek 硬校准：拖动进度条/点击歌词跳转后，引擎墙钟时钟已与真实位置错位，
  // 用 force 精确跳转到 目标位置+偏移；随后引擎壁钟从该点继续推进，我们不再干预。
  // （不再跑周期收敛：那会每秒反复 force 重锚，把调好的偏移带到滞后的 currentTime 上，反而时准时不准）
  useEffect(() => {
    if (!seekCommand || seekCommand.seq === lastSeekSeqRef.current) return;
    lastSeekSeqRef.current = seekCommand.seq;
    lastSeekAtRef.current = Date.now();
    forceSetTime(getAmllTime(seekCommand.time));
  }, [seekCommand]);

  // seek 锁释放边缘校正：拖动/点击歌词走的 seek 锁（useSeekLock）释放的那一刻，
  // 当前进度 currentTime 已切回播放器真实落点。无损 seek 常落在目标邻近的随机访问点
  // （长歌尤甚，可偏数秒），导致引擎仍停在请求目标、与真实落点脱节。此处若真实落点
  // 与锁定期间喂给引擎的目标偏差 > 1.5s，就单次 force 重锚引擎到真实落点。
  // 只做一次性校正（不做周期循环），因此不会像之前的自动校正那样把逐字歌词搞卡。
  useEffect(() => {
    if (wasLockedRef.current && !syncLocked) {
      const fed = lastFedAmllRef.current;
      const landed = (currentTimeRef.current ?? 0) + effectiveDelay;
      if (fed != null && Number.isFinite(landed) && Math.abs(landed - fed) > 1.5 && readyRef.current) {
        forceSetTime(landed);
      }
    }
    wasLockedRef.current = syncLocked;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncLocked, effectiveDelay]);

  // 封面
  useEffect(() => {
    if (albumArt) inject(`window.amll.setAlbum(${JSON.stringify(albumArt)}); true;`);
  }, [albumArt]);

  // 对齐位置
  useEffect(() => {
    inject(`window.amll.setAlignPosition(${alignPosition}); true;`);
  }, [alignPosition]);

  // 背景模式
  useEffect(() => {
    applyBackgroundMode(backgroundMode);
  }, [backgroundMode]);

  // 歌词渲染性能项变化时实时下发到引擎（fps/blur/scale/spring/hidePassed）
  useEffect(() => {
    inject(`window.amll.setLyricPerf(${JSON.stringify(lyricPerf)}); true;`);
  }, [lyricPerf]);

  // 歌词显示/隐藏
  useEffect(() => {
    inject(`
      (function() {
        var el = document.getElementById('lyrics');
        if (el) {
          el.style.opacity = '${showLyrics ? '1' : '0'}';
          el.style.pointerEvents = '${showLyrics ? 'auto' : 'none'}';
        }
      })();
      true;
    `);
  }, [showLyrics]);

  // 字体样式
  useEffect(() => {
    inject(`window.amll.setFontStyle(${fontSize}, ${inactiveFontSize}, ${effectiveFontWeight}, ${lineMargin}); true;`);
    setTimeout(() => applyLyricLayout(), 100);
  }, [fontSize, inactiveFontSize, effectiveFontWeight, lineMargin, lyricFont, heitiFontWeight]);

  // 布局
  useEffect(() => {
    applyLyricLayout();
  }, [lyricAreaTop, lyricBottom, lyricPaddingTop, lyricPaddingLeft, lyricPaddingRight, lyricPaddingBottom, lyricTextAlign, effectiveFontWeight, showLyrics, lyricFont, heitiFontWeight]);

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: amllHtmlContent }}
        onMessage={handleMessage}
        onLoadEnd={handleLoadEnd}
        originWhitelist={['*']}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        backgroundColor="transparent"
        style={styles.webview}
      />
    </View>
  );
};

export default AMLLLyrics;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
