import { useClipRepository, useSettingsRepository } from '@lib/providers/DatabaseProvider';
import type { TeleprompterFont } from '@lib/repositories/types';
import {
  generateTeleprompterPiPVideo,
  type TeleprompterPiPVideo,
} from '@lib/services/teleprompterPiP';
import {
  addNativeTeleprompterPipListeners,
  startNativeTeleprompterPip,
  stopNativeTeleprompterPip,
} from '@lib/services/teleprompterPipNative';
import { VideoProcessor } from '@lib/services/VideoProcessor';
import { Icon } from '@shared/components/ui/Icon';
import { IconButton } from '@shared/components/ui/IconButton';
import { parseClips, serializeClips } from '@shared/utils/clip-parser';
import { isSimulatorRecording } from '@shared/utils/video';
import { useProjectStore } from '@stores/useProjectStore';
import {
  type CameraType,
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
} from 'expo-camera';
import * as Device from 'expo-device';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { isPictureInPictureSupported, useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  PinchGestureHandler,
  State,
  type PinchGestureHandlerGestureEvent,
  type PinchGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

type RecordingMode = 'camera' | 'audio';

const FONT_OPTIONS: { value: TeleprompterFont; label: string }[] = [
  { value: 'VarelaRound_400Regular', label: 'Varela' },
  { value: 'Nunito_400Regular', label: 'Nunito' },
  { value: 'OpenSans_400Regular', label: 'Open Sans' },
  { value: 'Lato_400Regular', label: 'Lato' },
  { value: 'Raleway_400Regular', label: 'Raleway' },
  { value: 'Inter_400Regular', label: 'Inter' },
  { value: 'Poppins_400Regular', label: 'Poppins' },
  { value: 'Lexend_400Regular', label: 'Lexend' },
  { value: 'AtkinsonHyperlegible_400Regular', label: 'Atkinson' },
  { value: 'Merriweather_400Regular', label: 'Merriweather' },
];

// Check if running on simulator (Device.isDevice is more reliable than Constants.isDevice)
const isSimulator = !Device.isDevice;

// Scroll speed constants (pixels per second)
const MIN_SPEED = 10;
const MAX_SPEED = 120;
const SPEED_STEP = 2.5;
const MIN_TEXT_SIZE = 16;
const MAX_TEXT_SIZE = 48;
const TEXT_SIZE_STEP = 2;
const MIN_PREPARATION_DELAY_SECONDS = 3;
const MAX_PREPARATION_DELAY_SECONDS = 60;
const PREPARATION_DELAY_STEP_SECONDS = 3;
const PIP_VIDEO_WIDTH = 1280;
const PIP_VIDEO_HEIGHT = 720;
// Native PiP is a horizontal (landscape) floating window.
const NATIVE_PIP_WIDTH = 1920;
const NATIVE_PIP_HEIGHT = 1080;

const MIN_ZOOM_FACTOR = 1.0;
const MAX_ZOOM_FACTOR = 2.0;
const DEFAULT_ZOOM_FACTOR = 1.0;

// Reading line position (raised for closer camera eye-line)
const READING_LINE_POSITION = 0.1;

// Delay before auto-scroll resumes after user lifts finger (ms)
const SCROLL_RESUME_DELAY = 1500;
const SCROLL_START_RETRY_DELAY = 120;
const SCROLL_START_MAX_RETRIES = 12;
const TELEPROMPTER_MAX_OFFSET_X = 120;
const TELEPROMPTER_MIN_OFFSET_Y = -180;
const TELEPROMPTER_MAX_OFFSET_Y = 120;
const PIP_READY_TIMEOUT_MS = 5000;
const PIP_READY_POLL_MS = 100;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function RecordScreen() {
  const { t } = useTranslation();
  const {
    id,
    clip: clipParam,
    mode: modeParam,
    preview: previewParam,
  } = useLocalSearchParams<{
    id: string;
    clip: string;
    mode: string;
    preview?: string;
  }>();

  const { getProject, updateProjectScript, updateProjectStatus } = useProjectStore();
  const clipRepository = useClipRepository();
  const settingsRepository = useSettingsRepository();
  const project = getProject(id ?? '');
  const clipIndex = parseInt(clipParam ?? '0', 10);
  const mode: RecordingMode = (modeParam as RecordingMode) || 'camera';

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [facing, setFacing] = useState<CameraType>('front');
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeedPreviewing, setIsSpeedPreviewing] = useState(false);
  const [isPinchZooming, setIsPinchZooming] = useState(false);
  const [isDraggingTeleprompter, setIsDraggingTeleprompter] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [zoomFactor, setZoomFactor] = useState(DEFAULT_ZOOM_FACTOR);
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const isLandscape = winWidth > winHeight;
  const [showRotationHint, setShowRotationHint] = useState(true);

  useFocusEffect(
    useCallback(() => {
      void ScreenOrientation.unlockAsync();
      setShowRotationHint(true);
      return () => {
        void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      };
    }, [])
  );

  const cameraRef = useRef<CameraView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartTime = useRef<number>(0);
  const pinchStartZoomFactorRef = useRef(DEFAULT_ZOOM_FACTOR);

  // Inline review state
  const [isReviewing, setIsReviewing] = useState(previewParam === 'true');
  const [savedVideoUri, setSavedVideoUri] = useState<string | null>(null);
  const [savedDuration, setSavedDuration] = useState<number | null>(null);
  const [isPlayingReview, setIsPlayingReview] = useState(false);
  const [hasReviewPlaybackEnded, setHasReviewPlaybackEnded] = useState(false);
  const [isBeautifying, setIsBeautifying] = useState(false);
  const [hasBeautified, setHasBeautified] = useState(false);
  const [isExternalRecording, setIsExternalRecording] = useState(false);
  const [pipVideo, setPipVideo] = useState<TeleprompterPiPVideo | null>(null);
  const [isRenderingPip, setIsRenderingPip] = useState(false);
  const [pipError, setPipError] = useState<string | null>(null);
  const [isPipActive, setIsPipActive] = useState(false);
  const [isStartingPip, setIsStartingPip] = useState(false);
  const [isPipPlayerReady, setIsPipPlayerReady] = useState(false);
  const [pendingPipStart, setPendingPipStart] = useState(false);
  const [hasStartedPipFlow, setHasStartedPipFlow] = useState(false);
  const pipVideoViewRef = useRef<VideoView>(null);

  // Load existing clip data for preview mode
  const existingClipData = useMemo(() => {
    if (!id) return null;
    const clips = clipRepository.getByProject(id);
    return clips.find((c) => c.index === clipIndex);
  }, [id, clipIndex, clipRepository]);

  // Set saved video data from existing clip if in preview mode
  useEffect(() => {
    if (previewParam === 'true' && existingClipData) {
      setSavedVideoUri(existingClipData.videoUri ?? null);
      setSavedDuration(existingClipData.durationSeconds ?? null);
      setIsReviewing(true);
    }
  }, [previewParam, existingClipData]);

  // Teleprompter settings from database
  const teleprompterSettings = useMemo(
    () => settingsRepository.getTeleprompterSettings(),
    [settingsRepository]
  );
  const [textSize, setTextSize] = useState(teleprompterSettings.textSize);
  const [preparationDelaySeconds, setPreparationDelaySeconds] = useState(
    teleprompterSettings.preparationDelaySeconds
  );
  const [teleprompterFont, setTeleprompterFont] = useState<TeleprompterFont>(
    teleprompterSettings.fontFamily ?? 'VarelaRound_400Regular'
  );
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [isEditingText, setIsEditingText] = useState(false);
  const [editText, setEditText] = useState('');

  // Scroll state
  const [scrollSpeed, setScrollSpeed] = useState(teleprompterSettings.scrollSpeed);
  const [teleprompterOffset, setTeleprompterOffset] = useState({ x: 0, y: 0 });
  const [scrollContentHeight, setScrollContentHeight] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  // User-resizable prompter panel height (null = default ~3 lines of text)
  const [prompterHeight, setPrompterHeight] = useState<number | null>(null);
  const prompterZoneHeightRef = useRef(0);
  const panelHeightRef = useRef(0);
  const prompterResizeStartRef = useRef(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollAnimation = useRef(new Animated.Value(0)).current;
  const currentScrollPosition = useRef(0);
  const teleprompterOffsetRef = useRef({ x: 0, y: 0 });
  const teleprompterDragStartRef = useRef({ x: 0, y: 0 });

  // Manual scroll state
  const isUserScrolling = useRef(false);
  const userScrollOffset = useRef(0);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollStartRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset scroll to top when orientation changes so reading position is correct
  useEffect(() => {
    scrollAnimation.setValue(0);
    currentScrollPosition.current = 0;
    userScrollOffset.current = 0;
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  }, [isLandscape, scrollAnimation]);

  const clips = useMemo(() => {
    if (!project?.script) return [];
    return parseClips(project.script);
  }, [project?.script]);

  const currentClip = clips[clipIndex];
  const isTeleprompterActive = isRecording || isSpeedPreviewing;

  // Video player for review mode
  const isSimulatorVideo = isSimulatorRecording(savedVideoUri ?? undefined);
  const hasRealVideo = !!savedVideoUri && !isSimulatorVideo;
  const reviewVideoSource = hasRealVideo ? savedVideoUri : null;
  const reviewPlayer = useVideoPlayer(reviewVideoSource, (p) => {
    p.loop = false;
  });
  const pipPlayer = useVideoPlayer(pipVideo?.uri ?? null, (p) => {
    p.loop = false;
    p.muted = true;
    p.volume = 0;
    p.staysActiveInBackground = true;
  });

  // Subscribe to review player events
  useEffect(() => {
    if (!reviewPlayer) return;

    const playingSubscription = reviewPlayer.addListener('playingChange', (payload) => {
      setIsPlayingReview(payload.isPlaying);
      if (payload.isPlaying) {
        setHasReviewPlaybackEnded(false);
      }
    });

    const playToEndSubscription = reviewPlayer.addListener('playToEnd', () => {
      setIsPlayingReview(false);
      setHasReviewPlaybackEnded(true);
    });

    return () => {
      playingSubscription.remove();
      playToEndSubscription.remove();
    };
  }, [reviewPlayer]);

  useEffect(() => {
    setIsPlayingReview(false);
    setHasReviewPlaybackEnded(false);
  }, [reviewVideoSource]);

  const toggleReviewPlayback = useCallback(() => {
    if (isSimulatorVideo || !reviewPlayer) return;

    if (isPlayingReview) {
      reviewPlayer.pause();
    } else {
      const duration = reviewPlayer.duration;
      if (
        hasReviewPlaybackEnded ||
        (Number.isFinite(duration) && duration > 0 && reviewPlayer.currentTime >= duration - 0.05)
      ) {
        reviewPlayer.currentTime = 0;
      }
      reviewPlayer.play();
    }
  }, [hasReviewPlaybackEnded, isPlayingReview, isSimulatorVideo, reviewPlayer]);

  // Review scrubber: position tracking + drag-to-seek
  const [reviewPosition, setReviewPosition] = useState(0);
  const [reviewDuration, setReviewDuration] = useState(0);
  const isScrubbingRef = useRef(false);
  const scrubberWidthRef = useRef(1);

  useEffect(() => {
    if (!reviewPlayer || !hasRealVideo) return;
    reviewPlayer.timeUpdateEventInterval = 0.25;
    const sub = reviewPlayer.addListener('timeUpdate', (payload) => {
      if (!isScrubbingRef.current) setReviewPosition(payload.currentTime);
      setReviewDuration(reviewPlayer.duration || 0);
    });
    return () => sub.remove();
  }, [reviewPlayer, hasRealVideo]);

  const scrubTo = useCallback(
    (x: number) => {
      if (!reviewPlayer) return;
      const ratio = Math.max(0, Math.min(1, x / scrubberWidthRef.current));
      const time = ratio * (reviewPlayer.duration || 0);
      setReviewPosition(time);
      reviewPlayer.currentTime = time;
    },
    [reviewPlayer]
  );

  const scrubResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          isScrubbingRef.current = true;
          scrubTo(evt.nativeEvent.locationX);
        },
        onPanResponderMove: (evt) => {
          scrubTo(evt.nativeEvent.locationX);
        },
        onPanResponderRelease: () => {
          isScrubbingRef.current = false;
        },
        onPanResponderTerminate: () => {
          isScrubbingRef.current = false;
        },
      }),
    [scrubTo]
  );

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      setRecordingTime(0);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatScrollSpeed = useCallback((speed: number) => {
    const value = speed / 10;
    return value.toFixed(2).replace(/\.?0+$/, '');
  }, []);

  const saveClipToDatabase = useCallback(
    async (videoUri: string | undefined, durationSeconds: number, thumbnailUri?: string) => {
      if (!id) return;

      // Get existing clips for this project
      const existingClips = clipRepository.getByProject(id);
      const existingClip = existingClips.find((c) => c.index === clipIndex);

      if (existingClip) {
        // Delete old video file if it exists
        if (existingClip.videoUri) {
          await VideoProcessor.deleteVideo(existingClip.videoUri);
        }
        // Delete old thumbnail if it exists
        if (existingClip.thumbnailUri) {
          await VideoProcessor.deleteThumbnail(existingClip.thumbnailUri);
        }
        // Update existing clip
        clipRepository.update(existingClip.id, {
          videoUri,
          durationSeconds,
          thumbnailUri,
          status: 'done',
        });
      } else {
        // Create new clip
        clipRepository.create({
          projectId: id,
          index: clipIndex,
          text: currentClip?.text ?? '',
          status: 'done',
          source: 'recorded',
          videoUri,
          durationSeconds,
          thumbnailUri,
        });
      }

      // First recorded clip moves the project out of Script Ready
      if (getProject(id)?.status === 'scripted') {
        updateProjectStatus(id, 'filming');
      }
    },
    [clipRepository, clipIndex, currentClip?.text, id, getProject, updateProjectStatus]
  );

  // Simulator mock recording - just tracks time, no actual video
  const startSimulatorRecording = useCallback(() => {
    setIsRecording(true);
    recordingStartTime.current = Date.now();
  }, []);

  const stopSimulatorRecording = useCallback(async () => {
    setIsRecording(false);
    setIsSaving(true);

    // Calculate duration from timer
    const durationSeconds = Math.max(
      1,
      Math.round((Date.now() - recordingStartTime.current) / 1000)
    );

    // Save to database with simulator marker URI
    const simulatorUri = `simulator://mock-recording-${id}-${clipIndex}-${Date.now()}`;
    await saveClipToDatabase(simulatorUri, durationSeconds);

    setIsSaving(false);

    // Show inline review
    setSavedVideoUri(simulatorUri);
    setSavedDuration(durationSeconds);
    setIsReviewing(true);
  }, [clipIndex, id, saveClipToDatabase]);

  // Real device recording
  const startRealRecording = useCallback(async () => {
    if (!cameraRef.current) return;

    try {
      setIsRecording(true);
      recordingStartTime.current = Date.now();

      const video = await cameraRef.current.recordAsync({
        maxDuration: 300, // 5 minutes max
      });

      if (video?.uri) {
        setIsSaving(true);
        // Calculate duration
        const durationSeconds = Math.round((Date.now() - recordingStartTime.current) / 1000);

        // Generate unique filename and move to documents directory
        const filename = VideoProcessor.generateClipFilename(id ?? 'unknown', clipIndex);
        const destPath = VideoProcessor.getClipPath(filename);

        // Move from cache to documents using new File API
        const sourceFile = new File(video.uri);
        await sourceFile.move(new File(destPath));

        // Generate thumbnail
        const thumbnailUri = await VideoProcessor.generateThumbnail(
          destPath,
          id ?? 'unknown',
          clipIndex
        );

        // Save to database
        await saveClipToDatabase(destPath, durationSeconds, thumbnailUri);

        setIsSaving(false);

        // Show inline review
        setSavedVideoUri(destPath);
        setSavedDuration(durationSeconds);
        setIsReviewing(true);
      }
    } catch (error) {
      setIsRecording(false);
      setIsSaving(false);
      Alert.alert(t('common.error'), String(error));
    }
  }, [clipIndex, id, saveClipToDatabase, t]);

  const stopRealRecording = useCallback(() => {
    if (cameraRef.current && isRecording) {
      cameraRef.current.stopRecording();
      setIsRecording(false);
    }
  }, [isRecording]);

  const toggleRecording = useCallback(async () => {
    if (isSimulator) {
      // Simulator fallback (any platform emulator/simulator)
      if (isRecording) {
        await stopSimulatorRecording();
      } else {
        setIsSpeedPreviewing(false);
        startSimulatorRecording();
      }
    } else {
      // Real device
      if (isRecording) {
        stopRealRecording();
      } else {
        setIsSpeedPreviewing(false);
        await startRealRecording();
      }
    }
  }, [
    isRecording,
    startSimulatorRecording,
    stopSimulatorRecording,
    startRealRecording,
    stopRealRecording,
  ]);

  const handleUploadVideo = useCallback(async () => {
    if (isRecording) return false;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'videos',
      allowsMultipleSelection: false,
      quality: 1,
    });

    if (result.canceled || !result.assets[0]) return false;

    const asset = result.assets[0];
    setIsSaving(true);

    try {
      const filename = VideoProcessor.generateClipFilename(id ?? 'unknown', clipIndex);
      const destPath = VideoProcessor.getClipPath(filename);
      const sourceFile = new File(asset.uri);
      await sourceFile.copy(new File(destPath));

      const durationSeconds = asset.duration ? Math.round(asset.duration / 1000) : 0;

      const thumbnailUri = await VideoProcessor.generateThumbnail(
        destPath,
        id ?? 'unknown',
        clipIndex
      );

      await saveClipToDatabase(destPath, durationSeconds, thumbnailUri);

      setIsSaving(false);
      setSavedVideoUri(destPath);
      setSavedDuration(durationSeconds);
      setIsReviewing(true);
      return true;
    } catch {
      setIsSaving(false);
      Alert.alert(t('common.error'), t('clips.importFailed'));
      return false;
    }
  }, [isRecording, id, clipIndex, saveClipToDatabase, t]);

  const handleOpenExternalRecording = useCallback(() => {
    if (isRecording) return;
    setIsSpeedPreviewing(false);
    setPipError(null);
    setIsExternalRecording(true);
  }, [isRecording]);

  useEffect(() => {
    setIsPipPlayerReady(pipPlayer?.status === 'readyToPlay');
  }, [pipPlayer, pipVideo?.uri]);

  useEffect(() => {
    if (!pipPlayer) return;

    const statusSubscription = pipPlayer.addListener('statusChange', ({ status }) => {
      setIsPipPlayerReady(status === 'readyToPlay');
    });

    return () => {
      statusSubscription.remove();
    };
  }, [pipPlayer]);

  const waitForPipPlayerReady = useCallback(async () => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < PIP_READY_TIMEOUT_MS) {
      if (pipPlayer?.status === 'readyToPlay') {
        return true;
      }
      await sleep(PIP_READY_POLL_MS);
    }

    return pipPlayer?.status === 'readyToPlay';
  }, [pipPlayer]);

  const handleRenderPipVideo = useCallback(async () => {
    if (!id || !currentClip?.text || isRenderingPip) return false;

    if (!isPictureInPictureSupported()) {
      setPipError(t('externalRecording.pipUnsupported'));
      return false;
    }

    setIsRenderingPip(true);
    setPipError(null);

    try {
      const video = await generateTeleprompterPiPVideo({
        projectId: id,
        clipIndex,
        text: currentClip.text,
        fontFamily: teleprompterFont,
        textSize,
        scrollSpeed,
        preparationDelaySeconds,
        width: PIP_VIDEO_WIDTH,
        height: PIP_VIDEO_HEIGHT,
      });
      setPipVideo(video);
      return true;
    } catch (error) {
      console.warn('[external-recording] PiP render failed', error);
      setPipError(t('externalRecording.renderFailed'));
      return false;
    } finally {
      setIsRenderingPip(false);
    }
  }, [
    clipIndex,
    currentClip?.text,
    id,
    isRenderingPip,
    preparationDelaySeconds,
    scrollSpeed,
    teleprompterFont,
    textSize,
    t,
  ]);

  const handleStartPictureInPicture = useCallback(async () => {
    if (!pipVideo || !pipPlayer || !pipVideoViewRef.current || isStartingPip) return;

    try {
      setIsStartingPip(true);
      setPipError(null);

      const isReady = await waitForPipPlayerReady();
      if (!isReady) {
        setPipError(t('externalRecording.pipNotReady'));
        return;
      }

      pipPlayer.replay();
      pipPlayer.play();
      await sleep(100);
      await pipVideoViewRef.current.startPictureInPicture();
    } catch (error) {
      console.warn('[external-recording] PiP start failed', error);
      setPipError(t('externalRecording.pipStartFailed'));
    } finally {
      setIsStartingPip(false);
    }
  }, [isStartingPip, pipPlayer, pipVideo, t, waitForPipPlayerReady]);

  const handleStartNativePictureInPicture = useCallback(async () => {
    if (!currentClip?.text || isStartingPip) return false;

    try {
      setIsStartingPip(true);
      setPipError(null);

      const started = await startNativeTeleprompterPip({
        text: currentClip.text,
        fontSize: textSize,
        fontFamily: teleprompterFont,
        scrollSpeed,
        preparationDelaySeconds,
        width: NATIVE_PIP_WIDTH,
        height: NATIVE_PIP_HEIGHT,
        autoBackgroundAfterStart: true,
      });

      if (!started) return false;

      // isPipActive is driven by the real onPipStart lifecycle event, not
      // optimistically here — see the native PiP listener effect below.
      return true;
    } catch (error) {
      console.warn('[external-recording] native PiP start failed', error);
      setPipError(t('externalRecording.pipStartFailed'));
      return false;
    } finally {
      setIsStartingPip(false);
    }
  }, [currentClip?.text, isStartingPip, preparationDelaySeconds, scrollSpeed, textSize, t]);

  // Reflect the real native PiP lifecycle in UI state instead of guessing.
  useEffect(() => {
    const remove = addNativeTeleprompterPipListeners({
      onStart: () => {
        setIsPipActive(true);
        setPipError(null);
      },
      onStop: () => {
        setIsPipActive(false);
      },
      onError: (message) => {
        console.warn('[external-recording] native PiP error', message);
        setIsPipActive(false);
        setPipError(t('externalRecording.pipStartFailed'));
      },
      onDebug: (message) => {
        console.warn('[pip-debug]', message);
      },
    });
    return remove;
  }, [t]);

  useEffect(() => {
    if (!pendingPipStart || !pipVideo) return;

    const timeout = setTimeout(() => {
      void handleStartPictureInPicture().finally(() => {
        setPendingPipStart(false);
      });
    }, 250);

    return () => {
      clearTimeout(timeout);
    };
  }, [handleStartPictureInPicture, pendingPipStart, pipVideo]);

  const handlePrepareAndStartPictureInPicture = useCallback(async () => {
    if (isRenderingPip || isStartingPip) return;

    setHasStartedPipFlow(true);

    const didStartNative = await handleStartNativePictureInPicture();
    if (didStartNative) {
      return;
    }

    if (pipVideo) {
      await handleStartPictureInPicture();
      return;
    }

    setPendingPipStart(true);
    const didRender = await handleRenderPipVideo();
    if (!didRender) {
      setPendingPipStart(false);
    }
  }, [
    handleRenderPipVideo,
    handleStartPictureInPicture,
    handleStartNativePictureInPicture,
    isRenderingPip,
    isStartingPip,
    pipVideo,
  ]);

  const handleCloseExternalRecording = useCallback(() => {
    void stopNativeTeleprompterPip();
    pipPlayer?.pause();
    setIsExternalRecording(false);
    setIsPipActive(false);
    setPendingPipStart(false);
    setHasStartedPipFlow(false);
    setPipError(null);
  }, [pipPlayer]);

  const handleImportRecordedTake = useCallback(async () => {
    const didImport = await handleUploadVideo();
    if (!didImport) return;

    void stopNativeTeleprompterPip();
    pipPlayer?.pause();
    setIsExternalRecording(false);
    setIsPipActive(false);
    setPendingPipStart(false);
  }, [handleUploadVideo, pipPlayer]);

  const toggleCamera = () => {
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  };

  // CameraView zoom is normalized from 0..1.
  const cameraZoom = useMemo(() => {
    return Math.max(
      0,
      Math.min(1, (zoomFactor - MIN_ZOOM_FACTOR) / (MAX_ZOOM_FACTOR - MIN_ZOOM_FACTOR))
    );
  }, [zoomFactor]);

  const handlePinchStateChange = useCallback(
    (event: PinchGestureHandlerStateChangeEvent) => {
      const { state } = event.nativeEvent;
      if (state === State.BEGAN) {
        pinchStartZoomFactorRef.current = zoomFactor;
      } else if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
        pinchStartZoomFactorRef.current = zoomFactor;
      }
    },
    [zoomFactor]
  );

  const handlePinchGestureEvent = useCallback((event: PinchGestureHandlerGestureEvent) => {
    const scale = event.nativeEvent.scale;
    const nextZoomFactor = Math.max(
      MIN_ZOOM_FACTOR,
      Math.min(MAX_ZOOM_FACTOR, pinchStartZoomFactorRef.current * scale)
    );
    setZoomFactor(nextZoomFactor);
  }, []);

  const toggleSpeedPreview = useCallback(() => {
    if (isRecording) return;
    setIsSpeedPreviewing((current) => !current);
  }, [isRecording]);

  // Inline review handlers
  const handleRetake = useCallback(async () => {
    // Delete the current video if it exists (skip for simulator URIs)
    if (savedVideoUri && !isSimulatorRecording(savedVideoUri)) {
      await VideoProcessor.deleteVideo(savedVideoUri);
    }

    // Delete thumbnail if it exists
    if (existingClipData?.thumbnailUri) {
      await VideoProcessor.deleteThumbnail(existingClipData.thumbnailUri);
    }

    // Reset clip in DB
    if (existingClipData) {
      clipRepository.update(existingClipData.id, {
        videoUri: undefined,
        thumbnailUri: undefined,
        durationSeconds: undefined,
        status: 'empty',
      });
    }

    // Reset review state
    setSavedVideoUri(null);
    setSavedDuration(null);
    setIsReviewing(false);
    setHasBeautified(false);
    setHasReviewPlaybackEnded(false);
  }, [savedVideoUri, existingClipData, clipRepository]);

  const handleKeepTake = useCallback(() => {
    router.replace(`/(main)/projects/${id}/clips?refresh=${Date.now()}`);
  }, [id]);

  const handleSmoothSkin = useCallback(async () => {
    if (!id || !savedVideoUri || isBeautifying) return;
    // Beautify requires real camera frames; simulator URIs have none.
    if (isSimulatorRecording(savedVideoUri)) return;

    setIsBeautifying(true);
    try {
      const originalUri = savedVideoUri;
      const newUri = await VideoProcessor.beautifyVideo(originalUri, id, clipIndex, 0.7);
      const newThumb = await VideoProcessor.generateThumbnail(newUri, id, clipIndex);

      const existing = clipRepository.getByProject(id).find((c) => c.index === clipIndex);
      if (existing) {
        if (existing.videoUri && existing.videoUri !== newUri) {
          await VideoProcessor.deleteVideo(existing.videoUri);
        }
        if (existing.thumbnailUri) {
          await VideoProcessor.deleteThumbnail(existing.thumbnailUri);
        }
        clipRepository.update(existing.id, {
          videoUri: newUri,
          thumbnailUri: newThumb,
        });
      }

      setSavedVideoUri(newUri);
      setHasBeautified(true);
    } catch (err) {
      // Surface the underlying native error in dev so we can diagnose Transformer / Vision
      // failures (codec missing, OOM, ML Kit init, etc.). User-facing copy stays generic.
      console.warn('[smooth-skin] beautify failed', err);
      Alert.alert(t('common.error'), t('review.smoothFailed'));
    } finally {
      setIsBeautifying(false);
    }
  }, [id, savedVideoUri, isBeautifying, clipIndex, clipRepository, t]);

  // Speed adjustment
  const adjustSpeed = useCallback(
    (delta: number) => {
      setScrollSpeed((current) => {
        const newSpeed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, current + delta));
        settingsRepository.setTeleprompterSettings({ scrollSpeed: newSpeed });
        setPipVideo(null);
        return newSpeed;
      });
    },
    [settingsRepository]
  );

  const adjustTextSize = useCallback(
    (delta: number) => {
      setTextSize((current) => {
        const nextSize = Math.max(MIN_TEXT_SIZE, Math.min(MAX_TEXT_SIZE, current + delta));
        settingsRepository.setTeleprompterSettings({ textSize: nextSize });
        setPipVideo(null);
        return nextSize;
      });
    },
    [settingsRepository]
  );

  const adjustPreparationDelay = useCallback(
    (delta: number) => {
      setPreparationDelaySeconds((current) => {
        const nextDelay = Math.max(
          MIN_PREPARATION_DELAY_SECONDS,
          Math.min(MAX_PREPARATION_DELAY_SECONDS, current + delta)
        );
        settingsRepository.setTeleprompterSettings({ preparationDelaySeconds: nextDelay });
        setPipVideo(null);
        return nextDelay;
      });
    },
    [settingsRepository]
  );

  const handleFontSelect = useCallback(
    (font: TeleprompterFont) => {
      setTeleprompterFont(font);
      settingsRepository.setTeleprompterSettings({ fontFamily: font });
      setPipVideo(null);
      setShowFontPicker(false);
    },
    [settingsRepository]
  );

  const handleOpenEditText = useCallback(() => {
    setEditText(currentClip?.text ?? '');
    setIsEditingText(true);
  }, [currentClip]);

  const handleSaveEditText = useCallback(() => {
    if (!id || !project) return;
    const parsedClips = parseClips(project.script);
    const updated = parsedClips.map((c) =>
      c.index === clipIndex ? { ...c, text: editText.trim() } : c
    );
    updateProjectScript(id, serializeClips(updated));
    setIsEditingText(false);
  }, [id, project, clipIndex, editText, updateProjectScript]);

  // Start scroll animation
  const startScrollAnimation = useCallback(
    (fromPosition: number = 0) => {
      const scrollDistance = scrollContentHeight - containerHeight;
      if (scrollDistance <= 0) return false; // No need to scroll if content fits

      const remainingDistance = scrollDistance - fromPosition;
      if (remainingDistance <= 0) return false; // User scrolled past end

      // Duration = distance / speed (px/s) * 1000 (ms)
      const duration = (remainingDistance / scrollSpeed) * 1000;

      scrollAnimation.setValue(fromPosition);
      Animated.timing(scrollAnimation, {
        toValue: scrollDistance,
        duration,
        useNativeDriver: false,
      }).start();
      return true;
    },
    [scrollContentHeight, containerHeight, scrollSpeed, scrollAnimation]
  );

  // Stop scroll animation
  const stopScrollAnimation = useCallback(() => {
    scrollAnimation.stopAnimation((value) => {
      currentScrollPosition.current = value;
    });
  }, [scrollAnimation]);

  // Clear any pending resume timer
  const clearResumeTimer = useCallback(() => {
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }, []);

  const clearScrollStartRetryTimer = useCallback(() => {
    if (scrollStartRetryTimerRef.current) {
      clearTimeout(scrollStartRetryTimerRef.current);
      scrollStartRetryTimerRef.current = null;
    }
  }, []);

  const startScrollWithRetry = useCallback(
    (fromPosition: number = 0) => {
      clearScrollStartRetryTimer();

      let attempts = 0;
      const tryStart = () => {
        if (!isTeleprompterActive || isUserScrolling.current) return;

        const started = startScrollAnimation(fromPosition);
        if (started) return;

        attempts += 1;
        if (attempts > SCROLL_START_MAX_RETRIES) return;

        scrollStartRetryTimerRef.current = setTimeout(tryStart, SCROLL_START_RETRY_DELAY);
      };

      tryStart();
    },
    [clearScrollStartRetryTimer, isTeleprompterActive, startScrollAnimation]
  );

  // Schedule auto-scroll resume after user releases finger
  const scheduleResume = useCallback(() => {
    clearResumeTimer();
    resumeTimerRef.current = setTimeout(() => {
      isUserScrolling.current = false;
      startScrollAnimation(userScrollOffset.current);
    }, SCROLL_RESUME_DELAY);
  }, [clearResumeTimer, startScrollAnimation]);

  // Manual scroll handlers
  const handleScrollBeginDrag = useCallback(() => {
    if (!isTeleprompterActive) return;
    isUserScrolling.current = true;
    clearResumeTimer();
    stopScrollAnimation();
  }, [isTeleprompterActive, clearResumeTimer, stopScrollAnimation]);

  const handleScrollEndDrag = useCallback(
    (e: { nativeEvent: { velocity?: { y: number } } }) => {
      if (!isTeleprompterActive || !isUserScrolling.current) return;
      // If no momentum (velocity near zero), schedule resume immediately
      const velocity = Math.abs(e.nativeEvent.velocity?.y ?? 0);
      if (velocity < 0.1) {
        scheduleResume();
      }
      // Otherwise wait for onMomentumScrollEnd
    },
    [isTeleprompterActive, scheduleResume]
  );

  const handleMomentumScrollEnd = useCallback(() => {
    if (!isTeleprompterActive || !isUserScrolling.current) return;
    scheduleResume();
  }, [isTeleprompterActive, scheduleResume]);

  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    userScrollOffset.current = e.nativeEvent.contentOffset.y;
  }, []);

  // Clean up resume timer on unmount
  useEffect(() => {
    return () => {
      clearResumeTimer();
      clearScrollStartRetryTimer();
    };
  }, [clearResumeTimer, clearScrollStartRetryTimer]);

  // Sync Animated.Value to actual ScrollView position
  useEffect(() => {
    const listenerId = scrollAnimation.addListener(({ value }) => {
      scrollViewRef.current?.scrollTo({ y: value, animated: false });
    });
    return () => {
      scrollAnimation.removeListener(listenerId);
    };
  }, [scrollAnimation]);

  // Handle teleprompter start/stop for recording + speed preview
  useEffect(() => {
    if (isTeleprompterActive) {
      // Reset to start and begin scrolling
      currentScrollPosition.current = 0;
      userScrollOffset.current = 0;
      isUserScrolling.current = false;
      clearResumeTimer();
      clearScrollStartRetryTimer();
      scrollAnimation.setValue(0);
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
      startScrollWithRetry(0);
    } else {
      stopScrollAnimation();
      clearResumeTimer();
      clearScrollStartRetryTimer();
      isUserScrolling.current = false;
    }
  }, [
    isTeleprompterActive,
    startScrollWithRetry,
    stopScrollAnimation,
    clearResumeTimer,
    clearScrollStartRetryTimer,
    scrollAnimation,
  ]);

  // Handle speed change while teleprompter is active
  useEffect(() => {
    if (isTeleprompterActive && !isUserScrolling.current) {
      // Stop current animation and restart with new speed from current position
      scrollAnimation.stopAnimation((value) => {
        currentScrollPosition.current = value;
        startScrollAnimation(value);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentionally only respond to scrollSpeed changes
  }, [scrollSpeed]);

  // If layout/content size updates while teleprompter is active, ensure auto-scroll kicks in.
  useEffect(() => {
    if (
      !isTeleprompterActive ||
      isUserScrolling.current ||
      containerHeight <= 0 ||
      scrollContentHeight <= 0
    ) {
      return;
    }

    scrollAnimation.stopAnimation((value) => {
      const offset = Number.isFinite(value) && value > 0 ? value : userScrollOffset.current;
      currentScrollPosition.current = offset;
      startScrollWithRetry(offset);
    });
  }, [
    isTeleprompterActive,
    containerHeight,
    scrollContentHeight,
    scrollAnimation,
    startScrollWithRetry,
  ]);

  // Layout handlers
  const handleContainerLayout = useCallback((event: LayoutChangeEvent) => {
    setContainerHeight(event.nativeEvent.layout.height);
    panelHeightRef.current = event.nativeEvent.layout.height;
  }, []);

  // Corner-drag resize for the prompter panel
  const prompterResizeResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dy) > 2,
      onPanResponderGrant: () => {
        prompterResizeStartRef.current = panelHeightRef.current;
      },
      onPanResponderMove: (_evt, gesture) => {
        const maxHeight = prompterZoneHeightRef.current || panelHeightRef.current;
        const next = Math.max(
          140,
          Math.min(maxHeight, prompterResizeStartRef.current + gesture.dy)
        );
        setPrompterHeight(next);
      },
    })
  ).current;

  const handleContentSizeChange = useCallback((_: number, height: number) => {
    setScrollContentHeight(height);
  }, []);

  const clampTeleprompterOffset = useCallback((x: number, y: number) => {
    return {
      x: Math.max(-TELEPROMPTER_MAX_OFFSET_X, Math.min(TELEPROMPTER_MAX_OFFSET_X, x)),
      y: Math.max(TELEPROMPTER_MIN_OFFSET_Y, Math.min(TELEPROMPTER_MAX_OFFSET_Y, y)),
    };
  }, []);

  useEffect(() => {
    teleprompterOffsetRef.current = teleprompterOffset;
  }, [teleprompterOffset]);

  const teleprompterDragResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          setIsDraggingTeleprompter(true);
          teleprompterDragStartRef.current = teleprompterOffsetRef.current;
        },
        onPanResponderMove: (_, gesture) => {
          const next = clampTeleprompterOffset(
            teleprompterDragStartRef.current.x + gesture.dx,
            teleprompterDragStartRef.current.y + gesture.dy
          );
          setTeleprompterOffset(next);
        },
        onPanResponderRelease: () => {
          setIsDraggingTeleprompter(false);
        },
        onPanResponderTerminate: () => {
          setIsDraggingTeleprompter(false);
        },
      }),
    [clampTeleprompterOffset]
  );

  // Permission handling
  const hasPermissions = cameraPermission?.granted && micPermission?.granted;

  const requestPermissions = async () => {
    const [cameraResult, micResult] = await Promise.all([
      requestCameraPermission(),
      requestMicPermission(),
    ]);
    return cameraResult.granted && micResult.granted;
  };

  if (!cameraPermission || !micPermission) {
    return (
      <View className="flex-1 items-center justify-center bg-studio">
        <Text className="font-sans text-white">{t('recording.loadingCamera')}</Text>
      </View>
    );
  }

  if (!hasPermissions && !isReviewing) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-studio px-8">
        <Text className="mb-5 text-center font-sans text-[15px] text-white">
          {t('recording.cameraPermission')}
        </Text>
        <Pressable
          onPress={requestPermissions}
          className="min-h-[56px] items-center justify-center rounded-2xl bg-primary px-7 active:scale-95"
        >
          <Text className="font-heading text-base text-white">
            {t('recording.grantPermission')}
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!currentClip) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-studio">
        <Text className="font-sans text-white">{t('recording.clipNotFound')}</Text>
        <Pressable onPress={() => router.back()} className="mt-2 min-h-[44px] justify-center px-4">
          <Text className="font-sans-medium text-white/70">{t('common.goBack')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (isSaving) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-studio">
        <Text className="font-sans-medium text-lg text-white">{t('scriptEditor.saving')}</Text>
      </SafeAreaView>
    );
  }

  if (isExternalRecording) {
    return (
      <SafeAreaView className="flex-1 bg-gray-950" edges={['top', 'bottom']}>
        <View className="flex-row items-center px-4 py-3">
          <Pressable onPress={handleCloseExternalRecording} className="-ml-2 mr-3 p-2">
            <Icon name="close" size={20} color="#9CA3AF" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-xs font-bold uppercase text-indigo-300">
              {t('externalRecording.scene', { number: clipIndex + 1 })}
            </Text>
            <Text className="mt-1 text-xl font-bold text-white">
              {t('externalRecording.title')}
            </Text>
          </View>
        </View>

        <View className="flex-1 px-4">
          <View className="h-40 overflow-hidden rounded-xl border border-white/10 bg-black">
            {pipVideo ? (
              <VideoView
                ref={pipVideoViewRef}
                player={pipPlayer}
                style={{ flex: 1 }}
                contentFit="contain"
                nativeControls={!isPipActive}
                allowsPictureInPicture
                startsPictureInPictureAutomatically
                onFirstFrameRender={() => {
                  setIsPipPlayerReady(true);
                }}
                onPictureInPictureStart={() => setIsPipActive(true)}
                onPictureInPictureStop={() => setIsPipActive(false)}
              />
            ) : (
              <View className="flex-1 justify-center px-5">
                <Text
                  className="text-center text-white"
                  numberOfLines={5}
                  style={{
                    fontFamily: teleprompterFont,
                    fontSize: Math.min(textSize, 24),
                    lineHeight: Math.min(textSize, 24) * 1.55,
                  }}
                >
                  {currentClip.text}
                </Text>
              </View>
            )}
          </View>

          <View className="py-5">
            <Text className="text-base font-semibold text-white">
              {t('externalRecording.stepsTitle')}
            </Text>
            <View className="mt-3 gap-3">
              {[
                t('externalRecording.stepStart'),
                t('externalRecording.stepSwitch'),
                t('externalRecording.stepRecord'),
                t('externalRecording.stepImport'),
              ].map((step, index) => (
                <View key={step} className="flex-row gap-3">
                  <View className="mt-0.5 h-6 w-6 items-center justify-center rounded-full bg-white/10">
                    <Text className="text-xs font-bold text-indigo-200">{index + 1}</Text>
                  </View>
                  <Text className="flex-1 text-sm leading-6 text-gray-300">{step}</Text>
                </View>
              ))}
            </View>

            <View className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-white">
                  {t('externalRecording.preparationDelay')}
                </Text>
                <Text className="text-sm font-bold text-indigo-200">
                  {t('externalRecording.delaySeconds', { seconds: preparationDelaySeconds })}
                </Text>
              </View>
              <View className="mt-4 flex-row items-center justify-between">
                <Pressable
                  onPress={() => adjustPreparationDelay(-PREPARATION_DELAY_STEP_SECONDS)}
                  disabled={preparationDelaySeconds <= MIN_PREPARATION_DELAY_SECONDS}
                  className="h-11 w-24 items-center justify-center rounded-full bg-white/10"
                  style={{
                    opacity: preparationDelaySeconds <= MIN_PREPARATION_DELAY_SECONDS ? 0.4 : 1,
                  }}
                >
                  <Text className="text-lg font-bold text-white">{t('recording.speedDown')}</Text>
                </Pressable>
                <Text className="px-4 text-center text-xs leading-5 text-gray-400">
                  {t('externalRecording.preparationDelayHint')}
                </Text>
                <Pressable
                  onPress={() => adjustPreparationDelay(PREPARATION_DELAY_STEP_SECONDS)}
                  disabled={preparationDelaySeconds >= MAX_PREPARATION_DELAY_SECONDS}
                  className="h-11 w-24 items-center justify-center rounded-full bg-white/10"
                  style={{
                    opacity: preparationDelaySeconds >= MAX_PREPARATION_DELAY_SECONDS ? 0.4 : 1,
                  }}
                >
                  <Text className="text-lg font-bold text-white">{t('recording.speedUp')}</Text>
                </Pressable>
              </View>
            </View>

            {pipError && (
              <View className="mt-4 rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-4">
                <Text className="text-sm leading-5 text-yellow-100">{pipError}</Text>
              </View>
            )}

            {isPipActive && (
              <View className="mt-4 rounded-2xl border border-green-500/40 bg-green-500/10 p-4">
                <Text className="text-sm font-semibold text-green-100">
                  {t('externalRecording.pipActive')}
                </Text>
              </View>
            )}

            <View className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <Text className="text-xs leading-5 text-white/60">
                {t('externalRecording.overlayNote')}
              </Text>
            </View>
          </View>
        </View>

        <View className="gap-3 px-4 pb-5">
          <Pressable
            onPress={handlePrepareAndStartPictureInPicture}
            disabled={isRenderingPip || isStartingPip}
            className="items-center rounded-2xl py-4"
            style={{ backgroundColor: isRenderingPip || isStartingPip ? '#4B5563' : '#3C3FEF' }}
          >
            <Text className="text-base font-semibold text-white">
              {isRenderingPip
                ? t('externalRecording.preparingPip')
                : isStartingPip || (pipVideo && !isPipPlayerReady)
                  ? t('externalRecording.startingPip')
                  : t('externalRecording.startPip')}
            </Text>
          </Pressable>
          {hasStartedPipFlow && (
            <Pressable
              onPress={handleImportRecordedTake}
              disabled={isRenderingPip}
              className="items-center rounded-2xl bg-white py-4"
              style={{ opacity: isRenderingPip ? 0.6 : 1 }}
            >
              <Text className="text-base font-semibold text-gray-950">
                {t('externalRecording.finishedRecording')}
              </Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // Inline review mode
  if (isReviewing) {
    return (
      <SafeAreaView className="flex-1 bg-studio" edges={['top', 'bottom']}>
        <View className="flex-row items-center justify-between px-4 py-3">
          <View className="flex-row items-center gap-2">
            <View className="rounded-full bg-white/10 px-3 py-[6px]">
              <Text className="font-sans-medium text-[12px] text-white">
                {t('review.clipNumber', { number: clipIndex + 1 })}
              </Text>
            </View>
            {isSimulatorVideo && (
              <View className="rounded-full bg-yellow-500 px-3 py-[6px]">
                <Text className="font-heading text-[11px] text-black">{t('review.simulator')}</Text>
              </View>
            )}
          </View>
          <IconButton
            icon="close"
            accessibilityLabel={t('common.close')}
            onPress={() => router.back()}
            size={20}
            color="#9CA3AF"
            className="-my-2 -mr-2"
          />
        </View>

        <Pressable
          onPress={toggleReviewPlayback}
          className="mx-4 flex-1 overflow-hidden rounded-[20px] bg-studio-raised"
        >
          {hasRealVideo && reviewPlayer ? (
            <VideoView
              player={reviewPlayer}
              style={{ flex: 1 }}
              contentFit="cover"
              nativeControls={false}
            />
          ) : isSimulatorVideo ? (
            <View className="flex-1 items-center justify-center">
              <Icon name="video" size={56} color="#9CA3AF" style={{ marginBottom: 8 }} />
              <Text className="text-lg font-semibold text-white">
                {t('review.simulatorRecording')}
              </Text>
              <Text className="mt-1 text-sm text-gray-400">
                {t('review.simulatorRecordedDuration', { seconds: savedDuration ?? 0 })}
              </Text>
            </View>
          ) : (
            <View className="flex-1 items-center justify-center">
              <Text className="text-gray-500">{t('review.noVideoRecorded')}</Text>
            </View>
          )}

          {hasRealVideo && !isPlayingReview && (
            <View className="absolute inset-0 items-center justify-center">
              <View className="h-16 w-16 items-center justify-center rounded-full bg-white/20">
                <Icon name="play" size={30} color="#FFFFFF" />
              </View>
            </View>
          )}

          {/* Player controls — transparent overlay inside the video */}
          {hasRealVideo && (
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.65)']}
              className="absolute bottom-0 left-0 right-0 h-24"
              pointerEvents="none"
            />
          )}
          {hasRealVideo && (
            <View
              className="absolute bottom-0 left-0 right-0 flex-row items-center px-4 pb-3"
              style={{ gap: 10 }}
            >
              <Pressable
                onPress={toggleReviewPlayback}
                accessibilityRole="button"
                className="h-11 w-11 items-center justify-center rounded-full bg-white/10"
              >
                <Icon name={isPlayingReview ? 'pause' : 'play'} size={18} color="#FFFFFF" />
              </Pressable>
              <Text className="font-mono text-[12px] text-white/80">
                {formatTime(Math.floor(reviewPosition))}
              </Text>
              <View
                className="flex-1 justify-center"
                style={{ height: 44 }}
                onLayout={(e) => {
                  scrubberWidthRef.current = Math.max(1, e.nativeEvent.layout.width);
                }}
                {...scrubResponder.panHandlers}
              >
                <View
                  style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' }}
                >
                  <View
                    style={{
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: '#FFFFFF',
                      width: `${reviewDuration > 0 ? (reviewPosition / reviewDuration) * 100 : 0}%`,
                    }}
                  />
                </View>
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: `${reviewDuration > 0 ? (reviewPosition / reviewDuration) * 100 : 0}%`,
                    marginLeft: -8,
                    height: 16,
                    width: 16,
                    borderRadius: 8,
                    backgroundColor: '#FFFFFF',
                  }}
                />
              </View>
              <Text className="font-mono text-[12px] text-white/60">
                {formatTime(Math.floor(reviewDuration))}
              </Text>
            </View>
          )}
        </Pressable>

        {hasRealVideo && Platform.OS !== 'android' && (
          <View className="px-4 pt-4">
            <Pressable
              onPress={handleSmoothSkin}
              disabled={isBeautifying || hasBeautified}
              className="min-h-[48px] flex-row items-center justify-center rounded-2xl"
              style={{
                backgroundColor: hasBeautified
                  ? 'rgba(52, 211, 153, 0.15)'
                  : 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                borderColor: hasBeautified ? '#34D399' : 'rgba(255,255,255,0.3)',
                opacity: isBeautifying ? 0.6 : 1,
              }}
            >
              <Icon
                name={hasBeautified ? 'check' : 'sparkles'}
                size={16}
                color={hasBeautified ? '#34D399' : '#FFFFFF'}
                style={{ marginRight: 8 }}
              />
              <Text className="font-heading text-[15px] text-white">
                {isBeautifying
                  ? t('review.smoothing')
                  : hasBeautified
                    ? t('review.smoothed')
                    : t('review.smoothSkin')}
              </Text>
            </Pressable>
          </View>
        )}

        <View className="flex-row gap-3 px-4 py-6">
          <Pressable
            onPress={handleRetake}
            disabled={isBeautifying}
            className="min-h-[56px] flex-1 flex-row items-center justify-center rounded-2xl border border-solid border-white/30 active:scale-95"
            style={{ opacity: isBeautifying ? 0.5 : 1 }}
          >
            <Icon name="refresh" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text className="font-heading text-base text-white">{t('review.retake')}</Text>
          </Pressable>
          <Pressable
            onPress={handleKeepTake}
            disabled={isBeautifying}
            className="min-h-[56px] flex-1 flex-row items-center justify-center rounded-2xl bg-primary active:scale-95"
            style={{ opacity: isBeautifying ? 0.5 : 1 }}
          >
            <Icon name="check" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text className="font-heading text-base text-white">{t('review.keepTake')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <PinchGestureHandler
      enabled={mode === 'camera'}
      onGestureEvent={handlePinchGestureEvent}
      onHandlerStateChange={(event) => {
        handlePinchStateChange(event);
        const { state } = event.nativeEvent;
        if (state === State.BEGAN || state === State.ACTIVE) {
          setIsPinchZooming(true);
        }
        if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
          setIsPinchZooming(false);
        }
      }}
    >
      <View style={{ flex: 1 }}>
        <View className="flex-1 bg-black">
          {mode === 'camera' ? (
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFillObject}
              facing={facing}
              mode="video"
              videoQuality="2160p"
              zoom={cameraZoom}
            />
          ) : (
            <View style={StyleSheet.absoluteFillObject} className="bg-gray-900">
              <View className="flex-1 items-center justify-center">
                <Icon name="image" size={56} color="#6B7280" />
              </View>
            </View>
          )}

          <SafeAreaView
            style={{ flex: 1 }}
            edges={isLandscape ? ['left', 'right'] : ['top', 'bottom']}
          >
            {
              <>
                {/* Top row: close + scene counter + recording indicator */}
                <View className="flex-row items-center justify-between px-5 pt-2">
                  <IconButton
                    icon="close"
                    accessibilityLabel={t('common.close')}
                    onPress={() => router.back()}
                    disabled={isRecording}
                    variant="overlay"
                    size={20}
                  />

                  {isRecording ? (
                    <View
                      className="flex-row items-center rounded-full px-3.5 py-[7px]"
                      style={{ backgroundColor: '#FF3B30' }}
                    >
                      <View className="mr-1.5 h-2 w-2 rounded-full bg-white" />
                      <Text className="font-mono text-[13px] text-white">
                        {formatTime(recordingTime)}
                      </Text>
                    </View>
                  ) : (
                    <View className="flex-row items-center gap-2">
                      {isSimulator && (
                        <View className="rounded-full bg-yellow-500 px-3 py-[6px]">
                          <Text className="font-heading text-[11px] text-black">
                            {t('recording.simulatorMode')}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>

                {/* Teleprompter text overlay */}
                <View
                  className="flex-1 px-4 pt-3"
                  onLayout={(e) => {
                    prompterZoneHeightRef.current = e.nativeEvent.layout.height - 60;
                  }}
                  style={{
                    transform: [
                      { translateX: teleprompterOffset.x },
                      { translateY: teleprompterOffset.y },
                    ],
                  }}
                >
                  {/* Fixed prompter panel — text scrolls inside it; default height ~3 lines */}
                  <View
                    className="overflow-hidden rounded-2xl"
                    onLayout={handleContainerLayout}
                    style={{
                      backgroundColor: 'rgba(0,0,0,0.65)',
                      height: prompterHeight ?? Math.round(textSize * 1.55 * 3) + 64,
                    }}
                  >
                    <ScrollView
                      ref={scrollViewRef}
                      className="flex-1"
                      showsVerticalScrollIndicator={false}
                      scrollEnabled={!isPinchZooming && !isDraggingTeleprompter}
                      scrollEventThrottle={16}
                      onContentSizeChange={handleContentSizeChange}
                      onScrollBeginDrag={handleScrollBeginDrag}
                      onScrollEndDrag={handleScrollEndDrag}
                      onMomentumScrollEnd={handleMomentumScrollEnd}
                      onScroll={handleScroll}
                      contentContainerStyle={{
                        paddingTop: containerHeight * READING_LINE_POSITION,
                        paddingBottom: containerHeight * (1 - READING_LINE_POSITION),
                        paddingHorizontal: 20,
                      }}
                    >
                      <Text
                        className="leading-relaxed text-white"
                        style={{
                          fontSize: textSize,
                          lineHeight: textSize * 1.55,
                          fontFamily: teleprompterFont,
                        }}
                      >
                        {currentClip.text}
                      </Text>
                    </ScrollView>
                  </View>

                  {/* Prompter controls — below the panel so text never scrolls under them */}
                  <View className="mt-2 flex-row items-center" style={{ gap: 8 }}>
                    <View
                      className="min-h-[36px] rounded-full px-3.5"
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        backgroundColor: 'rgba(0,0,0,0.65)',
                      }}
                      {...teleprompterDragResponder.panHandlers}
                    >
                      <Icon name="move" size={13} color="rgba(255,255,255,0.8)" />
                      <Text className="font-sans-medium text-[12px] text-white/80">
                        {t('recording.move')}
                      </Text>
                    </View>
                    {!isRecording && (
                      <Pressable
                        onPress={handleOpenEditText}
                        hitSlop={8}
                        className="min-h-[36px] rounded-full px-3.5"
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 5,
                          backgroundColor: 'rgba(0,0,0,0.65)',
                        }}
                      >
                        <Icon name="edit" size={12} color="rgba(255,255,255,0.8)" />
                        <Text className="font-sans-medium text-[12px] text-white/80">
                          {t('common.edit')}
                        </Text>
                      </Pressable>
                    )}
                    <View className="flex-1" />
                    {/* Resize grip — drag to change panel height */}
                    <View
                      className="h-9 w-9 items-center justify-center rounded-full"
                      style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}
                      {...prompterResizeResponder.panHandlers}
                    >
                      <Icon name="resize" size={16} color="rgba(255,255,255,0.8)" />
                    </View>
                  </View>
                </View>

                {/* Font picker overlay */}
                {showFontPicker && !isRecording && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ flexGrow: 0 }}
                    contentContainerStyle={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      paddingHorizontal: 16,
                      paddingBottom: 8,
                    }}
                  >
                    {FONT_OPTIONS.map((option) => {
                      const isSelected = teleprompterFont === option.value;
                      return (
                        <Pressable
                          key={option.value}
                          onPress={() => handleFontSelect(option.value)}
                          style={{
                            alignItems: 'center',
                            borderRadius: 12,
                            paddingHorizontal: 16,
                            paddingVertical: 8,
                            backgroundColor: isSelected ? '#3C3FEF' : 'rgba(0,0,0,0.6)',
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: option.value,
                              color: 'white',
                              fontSize: 14,
                              fontWeight: isSelected ? '700' : '400',
                            }}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}

                {showRotationHint && !isRecording && (
                  <Pressable
                    onPress={() => setShowRotationHint(false)}
                    style={{
                      marginHorizontal: 16,
                      marginBottom: 10,
                      borderRadius: 12,
                      backgroundColor: '#3C3FEF',
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.3,
                      shadowRadius: 6,
                      elevation: 4,
                    }}
                  >
                    <Icon name="refresh" size={18} color="#FFFFFF" />
                    <Text
                      style={{
                        flex: 1,
                        color: 'white',
                        fontSize: 13,
                        fontWeight: '600',
                        lineHeight: 17,
                      }}
                    >
                      {t('recording.rotationHint')}
                    </Text>
                    <Icon name="close" size={16} color="rgba(255,255,255,0.85)" />
                  </Pressable>
                )}

                {/* Bottom controls */}
                <View
                  style={{
                    alignItems: 'center',
                    paddingTop: 8,
                    paddingBottom: isLandscape ? 12 : 24,
                    flexDirection: isLandscape ? 'row' : 'column',
                    justifyContent: 'center',
                    gap: isLandscape ? 24 : 0,
                  }}
                >
                  <View
                    className={`flex-row items-center rounded-full px-4 py-2 ${
                      isLandscape ? '' : 'justify-between self-stretch'
                    }`}
                    style={{
                      backgroundColor: 'rgba(0,0,0,0.65)',
                      gap: 4,
                      marginBottom: isLandscape ? 0 : 24,
                      marginHorizontal: isLandscape ? 0 : 16,
                    }}
                  >
                    <Pressable
                      onPress={() => adjustTextSize(-TEXT_SIZE_STEP)}
                      className="items-center justify-center rounded-full px-4 py-3"
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    >
                      {/* eslint-disable-next-line i18next/no-literal-string -- glyph, not copy */}
                      <Text className="font-heading text-base text-white">T-</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => adjustTextSize(TEXT_SIZE_STEP)}
                      className="items-center justify-center rounded-full px-4 py-3"
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    >
                      {/* eslint-disable-next-line i18next/no-literal-string -- glyph, not copy */}
                      <Text className="font-heading text-base text-white">T+</Text>
                    </Pressable>
                    {!isRecording && (
                      <Pressable
                        onPress={() => setShowFontPicker((v) => !v)}
                        className="items-center justify-center rounded-full px-3 py-3"
                        style={{ backgroundColor: showFontPicker ? '#3C3FEF' : 'transparent' }}
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                      >
                        {/* eslint-disable i18next/no-literal-string -- glyph, not copy */}
                        <Text
                          className="text-sm font-bold"
                          style={{ color: 'white', fontFamily: teleprompterFont }}
                        >
                          Aa
                        </Text>
                        {/* eslint-enable i18next/no-literal-string */}
                      </Pressable>
                    )}
                    <View className="mx-1 h-5 w-px bg-white/20" />
                    {!isRecording && (
                      <Pressable
                        onPress={toggleSpeedPreview}
                        className="items-center justify-center px-3 py-3"
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                      >
                        <Icon
                          name={isSpeedPreviewing ? 'pause' : 'play'}
                          size={16}
                          color="#FFFFFF"
                        />
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => adjustSpeed(-SPEED_STEP)}
                      className="items-center justify-center px-3 py-3"
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    >
                      <Text className="text-base text-white">{t('recording.speedDown')}</Text>
                    </Pressable>
                    {/* eslint-disable i18next/no-literal-string -- unit suffix */}
                    <Text className="w-10 text-center font-sans-medium text-[12px] text-white/70">
                      {formatScrollSpeed(scrollSpeed)}x
                    </Text>
                    {/* eslint-enable i18next/no-literal-string */}
                    <Pressable
                      onPress={() => adjustSpeed(SPEED_STEP)}
                      className="items-center justify-center px-3 py-3"
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    >
                      <Text className="text-base text-white">{t('recording.speedUp')}</Text>
                    </Pressable>
                  </View>

                  <View
                    className="flex-row items-center justify-center"
                    style={{ gap: isLandscape ? 20 : 16 }}
                  >
                    <Pressable
                      onPress={handleUploadVideo}
                      disabled={isRecording}
                      className={`items-center justify-center rounded-full bg-white/20 ${
                        isLandscape ? 'h-14 w-14' : 'h-[72px] w-[72px]'
                      }`}
                      style={{ opacity: isRecording ? 0.3 : 1 }}
                    >
                      <Icon name="folder" size={22} color="#FFFFFF" />
                      {!isLandscape && (
                        <Text className="mt-0.5 font-sans-medium text-[11px] text-white/90">
                          {t('recording.uploadVideo')}
                        </Text>
                      )}
                    </Pressable>

                    <Pressable
                      onPress={handleOpenExternalRecording}
                      disabled={isRecording}
                      className={`items-center justify-center rounded-full bg-white/20 ${
                        isLandscape ? 'h-14 w-14' : 'h-[72px] w-[72px]'
                      }`}
                      style={{ opacity: isRecording ? 0.3 : 1 }}
                    >
                      <Icon name="camera" size={22} color="#FFFFFF" />
                      {!isLandscape && (
                        <Text className="mt-0.5 font-sans-medium text-[11px] text-white/90">
                          {t('recording.externalCamera')}
                        </Text>
                      )}
                    </Pressable>

                    <Pressable
                      onPress={toggleRecording}
                      accessibilityRole="button"
                      accessibilityLabel={
                        isRecording ? t('recording.stopRecording') : t('recording.startRecording')
                      }
                      className={`items-center justify-center rounded-full active:scale-95 ${
                        isLandscape ? 'h-16 w-16' : 'h-20 w-20'
                      }`}
                      style={{ borderWidth: 4, borderColor: '#FFFFFF' }}
                    >
                      <View
                        style={
                          isRecording
                            ? {
                                backgroundColor: '#FF3B30',
                                width: isLandscape ? 24 : 30,
                                height: isLandscape ? 24 : 30,
                                borderRadius: 8,
                              }
                            : {
                                backgroundColor: '#FF3B30',
                                width: isLandscape ? 42 : 56,
                                height: isLandscape ? 42 : 56,
                                borderRadius: 28,
                              }
                        }
                      />
                    </Pressable>

                    {mode === 'camera' ? (
                      <Pressable
                        onPress={toggleCamera}
                        disabled={isRecording}
                        className={`items-center justify-center rounded-full bg-white/20 ${
                          isLandscape ? 'h-14 w-14' : 'h-[72px] w-[72px]'
                        }`}
                        style={{ opacity: isRecording ? 0.3 : 1 }}
                      >
                        <Icon name="cameraFlip" size={22} color="#FFFFFF" />
                        {!isLandscape && (
                          <Text className="mt-0.5 font-sans-medium text-[11px] text-white/90">
                            {t('recording.flipCamera')}
                          </Text>
                        )}
                      </Pressable>
                    ) : (
                      <View className={isLandscape ? 'h-14 w-14' : 'h-[72px] w-[72px]'} />
                    )}
                  </View>
                </View>
              </>
            }
          </SafeAreaView>
        </View>
        {/* Edit text modal */}
        <Modal
          visible={isEditingText}
          transparent
          animationType="slide"
          onRequestClose={() => setIsEditingText(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1 justify-end"
          >
            <View
              style={{
                backgroundColor: '#1C1A1E',
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                padding: 20,
              }}
            >
              <View className="mb-4 flex-row items-center justify-between">
                <Text className="font-heading text-base text-white">
                  {t('recording.editScript')}
                </Text>
                <IconButton
                  icon="close"
                  accessibilityLabel={t('common.close')}
                  onPress={() => setIsEditingText(false)}
                  size={20}
                  color="#9CA3AF"
                  className="-my-2 -mr-2"
                />
              </View>
              <TextInput
                value={editText}
                onChangeText={setEditText}
                multiline
                autoFocus
                style={{
                  color: 'white',
                  fontFamily: teleprompterFont,
                  fontSize: textSize,
                  lineHeight: textSize * 1.55,
                  minHeight: 140,
                  maxHeight: 280,
                  textAlignVertical: 'top',
                  backgroundColor: 'rgba(255,255,255,0.07)',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 16,
                }}
              />
              <Pressable
                onPress={handleSaveEditText}
                disabled={!editText.trim()}
                className="min-h-[56px] items-center justify-center rounded-2xl"
                style={{ backgroundColor: editText.trim() ? '#3C3FEF' : '#374151' }}
              >
                <Text className="font-heading text-base text-white">{t('common.save')}</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </PinchGestureHandler>
  );
}
