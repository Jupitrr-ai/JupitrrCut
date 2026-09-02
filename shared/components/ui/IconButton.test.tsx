import { IconButton } from '@shared/components/ui/IconButton';
import { fireEvent, render, screen } from '@testing-library/react-native';

describe('IconButton', () => {
  it('exposes its accessibility label and handles press', () => {
    const onPress = jest.fn();
    render(<IconButton icon="close" accessibilityLabel="Close" onPress={onPress} />);
    const button = screen.getByLabelText('Close');
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
