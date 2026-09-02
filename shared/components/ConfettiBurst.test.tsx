import { ConfettiBurst } from '@shared/components/ConfettiBurst';
import { act, render } from '@testing-library/react-native';

describe('ConfettiBurst', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders confetti pieces on mount', () => {
    const { toJSON } = render(<ConfettiBurst />);
    expect(toJSON()).not.toBeNull();
  });

  it('removes itself and fires onComplete after the burst', () => {
    const onComplete = jest.fn();
    const { toJSON } = render(<ConfettiBurst onComplete={onComplete} />);

    act(() => {
      jest.advanceTimersByTime(4000);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(toJSON()).toBeNull();
  });
});
