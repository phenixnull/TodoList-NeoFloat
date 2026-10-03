import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import { ReactNode } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

type Props = PressableProps & {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function PressableScale({ children, style, ...props }: Props) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      {...props}
      style={[animatedStyle, style]}
      onPressIn={(event) => {
        scale.set(withSpring(0.97, { damping: 20 }));
        props.onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.set(withSpring(1, { damping: 16 }));
        props.onPressOut?.(event);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}
