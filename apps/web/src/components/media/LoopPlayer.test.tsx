import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useMediaUrl', () => ({
  useMediaUrl: () => ({ data: { url: '/media/token', expiresAt: 0 }, isLoading: false, error: null, isFetching: false, refetch: vi.fn() }),
}));
vi.mock('./audioGraph', () => ({ analyserForElement: () => null, resumeAudio: async () => undefined }));
vi.mock('./Waveform', () => ({ Waveform: () => null }));

import { LoopPlayer } from './LoopPlayer';

let play: ReturnType<typeof vi.fn>;

beforeEach(() => {
  play = vi.fn(() => Promise.resolve());
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: play });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: vi.fn() });
});

describe('LoopPlayer', () => {
  it('auto-plays and loops exactly 3 times with a counter', async () => {
    const onComplete = vi.fn();
    const { container } = render(<LoopPlayer audioMediaId="m1" onComplete={onComplete} />);
    const audio = container.querySelector('audio')!;
    await act(async () => {
      fireEvent.canPlay(audio);
    });
    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Repetition 1 of 3')).toBeInTheDocument();

    await act(async () => {
      fireEvent.ended(audio);
    });
    expect(screen.getByLabelText('Repetition 2 of 3')).toBeInTheDocument();
    await act(async () => {
      fireEvent.ended(audio);
    });
    expect(screen.getByLabelText('Repetition 3 of 3')).toBeInTheDocument();
    expect(play).toHaveBeenCalledTimes(3);

    await act(async () => {
      fireEvent.ended(audio);
    });
    expect(play).toHaveBeenCalledTimes(3); // no 4th play
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Listened 3 times/)).toBeInTheDocument();
  });

  it('does not auto-play in preview mode until the play button is pressed', async () => {
    const { container } = render(<LoopPlayer audioMediaId="m1" autoPlay={false} />);
    await act(async () => {
      fireEvent.canPlay(container.querySelector('audio')!);
    });
    expect(play).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    });
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('shows an empty message without media', () => {
    render(<LoopPlayer />);
    expect(screen.getByText(/No recording has been added/)).toBeInTheDocument();
  });
});
