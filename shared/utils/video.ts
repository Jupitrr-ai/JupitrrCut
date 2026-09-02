/**
 * Video utility functions
 */

/**
 * Check if a URI is a simulator mock recording
 * Simulator recordings are marked with a special `simulator://` URI scheme
 */
export const isSimulatorRecording = (uri: string | undefined): boolean => {
  return uri?.startsWith('simulator://') ?? false;
};
