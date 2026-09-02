import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  View,
  type ModalProps,
} from 'react-native';

interface BottomSheetModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /**
   * Wrap content with KeyboardAvoidingView for modals with text inputs
   */
  keyboardAvoiding?: boolean;
  /**
   * Whether to show the drag handle at the top
   * @default true
   */
  showHandle?: boolean;
  /**
   * Additional props to pass to the Modal component
   */
  modalProps?: Partial<ModalProps>;
  /**
   * Test ID for the modal backdrop
   */
  testID?: string;
}

const DISMISS_DRAG_THRESHOLD = 120;
const DISMISS_VELOCITY_THRESHOLD = 0.8;
const EXIT_FALLBACK_DISTANCE = 600;

/**
 * A consistent bottom sheet modal component used across the app.
 *
 * Features (DESIGN.md motion: springy in, ease-out down):
 * - Springs up on open, slides down + backdrop fade on close
 * - Swipe down on the handle area to dismiss (flick or drag past threshold)
 * - Optional keyboard avoiding for forms
 * - Tap outside to dismiss
 */
export function BottomSheetModal({
  visible,
  onClose,
  children,
  keyboardAvoiding = false,
  showHandle = true,
  modalProps,
  testID,
}: BottomSheetModalProps) {
  // Modal stays mounted while the exit animation plays, then unmounts.
  const [rendered, setRendered] = useState(visible);
  const translateY = useRef(new Animated.Value(EXIT_FALLBACK_DISTANCE)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetHeightRef = useRef(EXIT_FALLBACK_DISTANCE);
  const closingRef = useRef(false);

  const animateOpen = useCallback(() => {
    closingRef.current = false;
    translateY.setValue(Math.min(sheetHeightRef.current, EXIT_FALLBACK_DISTANCE));
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 26,
        stiffness: 300,
        mass: 0.9,
      }),
    ]).start();
  }, [backdropOpacity, translateY]);

  const animateClose = useCallback(
    (after?: () => void) => {
      if (closingRef.current) return;
      closingRef.current = true;
      Keyboard.dismiss();
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, {
          toValue: sheetHeightRef.current + 40,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setRendered(false);
        after?.();
      });
    },
    [backdropOpacity, translateY]
  );

  useEffect(() => {
    if (visible) {
      setRendered(true);
    } else if (rendered && !closingRef.current) {
      // Parent closed us without a gesture (e.g. after submit) — still animate out.
      animateClose();
    }
  }, [visible, rendered, animateClose]);

  const requestClose = useCallback(() => {
    animateClose(onClose);
  }, [animateClose, onClose]);

  // Swipe-down-to-dismiss on the handle zone: follows the finger, springs back
  // if released early, dismisses past the drag or velocity threshold.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => {
        translateY.setValue(g.dy > 0 ? g.dy : g.dy / 8);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > DISMISS_DRAG_THRESHOLD || g.vy > DISMISS_VELOCITY_THRESHOLD) {
          requestCloseRef.current();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 26,
            stiffness: 300,
            mass: 0.9,
          }).start();
        }
      },
    })
  ).current;
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  // On Android, RN's Modal renders in its own window where KeyboardAvoidingView
  // can't measure the keyboard — so it covers the input. Track the keyboard
  // height ourselves and lift the sheet above it. iOS keeps KeyboardAvoidingView
  // (which works there and animates with the keyboard).
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    if (!keyboardAvoiding || Platform.OS !== 'android') return;
    const showSub = Keyboard.addListener('keyboardDidShow', (e) =>
      setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardAvoiding]);

  const content = (
    <View className="flex-1 justify-end">
      <Animated.View
        style={[
          { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
          { backgroundColor: 'rgba(0,0,0,0.5)', opacity: backdropOpacity },
        ]}
      >
        <Pressable
          className="flex-1"
          onPress={requestClose}
          testID={testID ? `${testID}-backdrop` : undefined}
        />
      </Animated.View>
      <Animated.View
        style={{ transform: [{ translateY }] }}
        onLayout={(e) => {
          sheetHeightRef.current = Math.max(e.nativeEvent.layout.height, 160);
        }}
      >
        <Pressable
          className="rounded-t-3xl bg-white px-6 pb-10 pt-4"
          onPress={(e) => {
            e.stopPropagation();
            Keyboard.dismiss();
          }}
          testID={testID ? `${testID}-content` : undefined}
        >
          {showHandle && (
            <View {...panResponder.panHandlers} className="-mx-6 -mt-4 px-6 pb-4 pt-4">
              <View className="h-1 w-12 self-center rounded-full bg-gray-300" />
            </View>
          )}
          {showHandle ? <View className="mb-2" /> : null}
          {children}
        </Pressable>
      </Animated.View>
    </View>
  );

  return (
    <Modal
      visible={rendered}
      transparent
      animationType="none"
      onRequestClose={requestClose}
      onShow={animateOpen}
      testID={testID}
      {...modalProps}
    >
      {keyboardAvoiding ? (
        Platform.OS === 'ios' ? (
          <KeyboardAvoidingView behavior="padding" className="flex-1">
            {content}
          </KeyboardAvoidingView>
        ) : (
          <View className="flex-1" style={{ paddingBottom: keyboardHeight }}>
            {content}
          </View>
        )
      ) : (
        content
      )}
    </Modal>
  );
}
