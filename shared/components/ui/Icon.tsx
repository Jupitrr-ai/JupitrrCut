import { Ionicons } from '@expo/vector-icons';
import type { StyleProp, TextStyle } from 'react-native';

/**
 * Semantic icon names → Ionicons glyphs. All app icons go through this map so
 * the underlying icon set can be swapped without touching call sites.
 */
const ICON_MAP = {
  arrowDown: 'arrow-down',
  arrowLeft: 'arrow-back',
  arrowRight: 'arrow-forward',
  arrowUp: 'arrow-up',
  back: 'chevron-back',
  camera: 'videocam',
  cameraFlip: 'camera-reverse-outline',
  check: 'checkmark',
  checkCircle: 'checkmark-circle',
  chevronForward: 'chevron-forward',
  clapperboard: 'film-outline',
  clapperboardFilled: 'film',
  clipboard: 'clipboard-outline',
  clock: 'time-outline',
  close: 'close',
  download: 'download-outline',
  facebook: 'logo-facebook',
  instagram: 'logo-instagram',
  edit: 'pencil',
  file: 'document-outline',
  folder: 'folder-open-outline',
  gift: 'gift',
  idea: 'bulb-outline',
  keyboardHide: 'chevron-down',
  ideaFilled: 'bulb',
  image: 'image-outline',
  link: 'link-outline',
  lightning: 'flash-outline',
  lightningFilled: 'flash',
  list: 'list',
  lock: 'lock-closed',
  logOut: 'log-out-outline',
  minus: 'remove',
  more: 'ellipsis-horizontal',
  move: 'move-outline',
  resize: 'resize-outline',
  notepad: 'document-text-outline',
  notifications: 'notifications',
  landscape: 'phone-landscape-outline',
  leaf: 'leaf',
  pause: 'pause',
  person: 'person-circle-outline',
  play: 'play',
  tiktok: 'logo-tiktok',
  youtube: 'logo-youtube',
  portrait: 'phone-portrait-outline',
  plus: 'add',
  refresh: 'refresh',
  scissors: 'cut-outline',
  scissorsFilled: 'cut',
  search: 'search',
  settings: 'settings-outline',
  shield: 'shield-checkmark',
  sparkles: 'sparkles',
  star: 'star-outline',
  starFilled: 'star',
  trash: 'trash-outline',
  video: 'videocam-outline',
} as const;

export type IconName = keyof typeof ICON_MAP;

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

export function Icon({ name, size = 20, color = '#101828', style }: IconProps) {
  return <Ionicons name={ICON_MAP[name]} size={size} color={color} style={style} />;
}
