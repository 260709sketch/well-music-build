import { requireNativeComponent, ViewStyle, StyleProp } from 'react-native';
import React from 'react';

type LiquidGlassDockProps = {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

const NativeLiquidGlassDock = requireNativeComponent('LiquidGlassDockView');

export const LiquidGlassDock: React.FC<LiquidGlassDockProps> = ({ style, children }) => {
  return (
    <NativeLiquidGlassDock style={style}>
      {children}
    </NativeLiquidGlassDock>
  );
};
