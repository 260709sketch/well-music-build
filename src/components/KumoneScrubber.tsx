import React, { useRef, useState } from 'react';
import { StyleSheet, View, Text, PanResponder, Animated } from 'react-native';

interface KumoneScrubberProps {
  progress: number; // 0-1
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  onSlidingChange?: (time: number) => void;
  showTime?: boolean;
}

// 完全对标 Kumone NowPlayingScrubber
// - 白色胶囊进度条 4px
// - 拖拽圆点平时隐藏，拖拽时显示白色带阴影圆点并放大
// - 等宽数字时间显示
// - 点击和拖拽都支持
const KumoneScrubber: React.FC<KumoneScrubberProps> = ({
  progress,
  currentTime,
  duration,
  onSeek,
  onSlidingChange,
  showTime = true,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);
  const widthRef = useRef(0);
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const displayProgress = isDragging ? dragProgress : Math.min(Math.max(progress, 0), 1);
  const displayTime = isDragging ? dragProgress * duration : currentTime;

  const showThumb = () => {
    Animated.spring(opacityAnim, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
    Animated.spring(scaleAnim, { toValue: 1.4, useNativeDriver: true, speed: 20 }).start();
  };

  const hideThumb = () => {
    Animated.spring(opacityAnim, { toValue: 0, useNativeDriver: true, speed: 25 }).start();
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 25 }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        setIsDragging(true);
        showThumb();
        const x = evt.nativeEvent.locationX;
        const p = widthRef.current > 0 ? Math.min(Math.max(x / widthRef.current, 0), 1) : 0;
        setDragProgress(p);
        onSlidingChange?.(p * duration);
      },
      onPanResponderMove: (evt) => {
        const x = evt.nativeEvent.locationX;
        const p = widthRef.current > 0 ? Math.min(Math.max(x / widthRef.current, 0), 1) : 0;
        setDragProgress(p);
        onSlidingChange?.(p * duration);
      },
      onPanResponderRelease: () => {
        setIsDragging(false);
        hideThumb();
        onSeek(dragProgress * duration);
      },
      onPanResponderTerminate: () => {
        setIsDragging(false);
        hideThumb();
      },
    }),
  ).current;

  const formatTime = (sec: number) => {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <View
        style={styles.trackWrapper}
        onLayout={(e) => { widthRef.current = e.nativeEvent.layout.width; }}
        {...panResponder.panHandlers}
      >
        {/* 底层轨道 */}
        <View style={styles.trackBg} />
        {/* 已播放 */}
        <View style={[styles.trackFill, { width: `${displayProgress * 100}%` }]} />
        {/* 拖拽圆点 */}
        <Animated.View
          style={[
            styles.thumb,
            {
              left: `${displayProgress * 100}%`,
              opacity: opacityAnim,
              transform: [
                { translateX: -6 },
                { scale: scaleAnim },
              ],
            },
          ]}
        />
      </View>
      {/* 时间 */}
      {showTime && (
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatTime(displayTime)}</Text>
          <Text style={styles.timeText}>{formatTime(duration)}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  trackWrapper: {
    height: 14,
    justifyContent: 'center',
  },
  trackBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#fff',
  },
  thumb: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 5,
  },
  timeText: {
    fontSize: 10.5,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.55)',
    fontVariant: ['tabular-nums'],
  },
});

export default KumoneScrubber;
