import { Button } from '@shared/components/ui/Button';
import { fireEvent, render, screen } from '@testing-library/react-native';

describe('Button', () => {
  it('renders its label', () => {
    render(<Button label="Save" onPress={jest.fn()} />);
    expect(screen.getByText('Save')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    render(<Button label="Save" onPress={onPress} />);
    fireEvent.press(screen.getByText('Save'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    render(<Button label="Save" onPress={onPress} disabled />);
    fireEvent.press(screen.getByText('Save'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows a spinner instead of the label while loading', () => {
    render(<Button label="Save" onPress={jest.fn()} loading />);
    expect(screen.queryByText('Save')).toBeNull();
    expect(screen.getByRole('button', { busy: true })).toBeTruthy();
  });
});
