import { LinearGradient } from 'expo-linear-gradient';
import { cssInterop } from 'nativewind';

// expo-linear-gradient is not a core RN component — className layout props
// (e.g. flex-1) are ignored unless mapped to style.
cssInterop(LinearGradient, { className: 'style' });
