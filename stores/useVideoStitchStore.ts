import { create } from 'zustand';

export interface SelectedVideo {
  id: string;
  uri: string;
  durationMs?: number;
  filename?: string;
}

interface VideoStitchStore {
  selectedVideos: SelectedVideo[];
  setSelectedVideos: (videos: SelectedVideo[]) => void;
  clearVideos: () => void;
}

export const useVideoStitchStore = create<VideoStitchStore>((set) => ({
  selectedVideos: [],
  setSelectedVideos: (videos) => set({ selectedVideos: videos }),
  clearVideos: () => set({ selectedVideos: [] }),
}));
