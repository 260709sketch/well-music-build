import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Asset } from 'expo-asset';

interface Props {
  albumArt?: string;
  hasLyric?: boolean;
  isPlaying?: boolean;
  // 静态模式优化：渲染5秒后暂停WebView内部渲染循环，8秒保底检查
  staticOptimize?: boolean;
}

const AMLLBackground: React.FC<Props> = ({
  albumArt,
  hasLyric = false,
  isPlaying = true,
  staticOptimize = false,
}) => {
  const webViewRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const [htmlUri, setHtmlUri] = useState<string | null>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  };

  // 静态模式优化：启动暂停定时器（5秒暂停 + 8秒保底）
  const startStaticOptimize = () => {
    if (!staticOptimize) return;
    clearTimers();
    // 5秒后暂停渲染（冷启动3秒出背景，5秒足够渲染完成）
    pauseTimerRef.current = setTimeout(() => {
      inject(`window.amllBg.setPlaying(false); true;`);
    }, 5000);
    // 8秒保底检查，确保暂停成功
    safetyTimerRef.current = setTimeout(() => {
      inject(`window.amllBg.setPlaying(false); true;`);
    }, 8000);
  };

  useEffect(() => {
    const asset = Asset.fromModule(require('../../assets/amll_bg.html'));
    asset.downloadAsync().then(() => {
      setHtmlUri(asset.localUri || asset.uri);
    }).catch((err) => {
      console.error('[AMLLBackground] Failed to load amll_bg.html:', err);
    });
    return () => clearTimers();
  }, []);

  const inject = (code: string) => {
    if (!readyRef.current) return;
    webViewRef.current?.injectJavaScript(code);
  };

  const handleMessage = (e: any) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'bg-ready') {
        readyRef.current = true;
        if (albumArt) inject(`window.amllBg.setAlbum(${JSON.stringify(albumArt)}); true;`);
        inject(`window.amllBg.setHasLyric(${hasLyric}); true;`);
        inject(`window.amllBg.setPlaying(${isPlaying}); true;`);
        // bg-ready后启动静态模式优化定时器
        if (staticOptimize && isPlaying) {
          startStaticOptimize();
        }
      }
    } catch {}
  };

  // 专辑图变化时（切歌），重新激活渲染，然后重启优化定时器
  useEffect(() => {
    if (albumArt) inject(`window.amllBg.setAlbum(${JSON.stringify(albumArt)}); true;`);
    if (staticOptimize && readyRef.current && isPlaying) {
      // 先恢复渲染，让新专辑图渲染出来
      inject(`window.amllBg.setPlaying(true); true;`);
      startStaticOptimize();
    }
  }, [albumArt]);

  useEffect(() => {
    inject(`window.amllBg.setHasLyric(${hasLyric}); true;`);
  }, [hasLyric]);

  useEffect(() => {
    inject(`window.amllBg.setPlaying(${isPlaying}); true;`);
    // isPlaying变化时，如果开启了静态优化且正在播放，重启定时器
    if (staticOptimize && readyRef.current) {
      if (isPlaying) {
        startStaticOptimize();
      } else {
        clearTimers();
      }
    }
  }, [isPlaying]);

  if (!htmlUri) return <View style={styles.webview} />;

  return (
    <WebView
      ref={webViewRef}
      source={
        Platform.OS === 'ios'
          ? { uri: htmlUri, allowingReadAccessToURL: htmlUri }
          : { uri: htmlUri }
      }
      onMessage={handleMessage}
      originWhitelist={['*']}
      allowFileAccess
      allowFileAccessFromFileURLs
      allowUniversalAccessFromFileURLs
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      backgroundColor="transparent"
      style={styles.webview}
    />
  );
};

export default AMLLBackground;

const styles = StyleSheet.create({
  webview: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
});
