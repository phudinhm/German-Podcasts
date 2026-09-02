/** Uniform control surface over YouTube, HTML5 audio and the virtual timeline. */
export interface PlayerHandle {
  play(): void;
  pause(): void;
  /** Seconds. `allowSeekAhead` mirrors the YouTube IFrame API argument. */
  seekTo(seconds: number, allowSeekAhead?: boolean): void;
  setRate(rate: number): void;
  setMuted(muted: boolean): void;
  getTime(): number;
  getDuration(): number;
  isPlaying(): boolean;
  isReady(): boolean;
}

export const NOOP_PLAYER: PlayerHandle = {
  play() {},
  pause() {},
  seekTo() {},
  setRate() {},
  setMuted() {},
  getTime: () => 0,
  getDuration: () => 0,
  isPlaying: () => false,
  isReady: () => false,
};
