import { render, screen, fireEvent } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { EditableScriptEditor } from './EditableScriptEditor';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'scriptEditor.title': 'Script Editor',
        'scriptEditor.subtitleEditable': 'Tap Split, Merge, or Delete to edit scenes',
        'scriptEditor.readyForRecording': 'Ready for recording',
        'scriptEditor.placeholder': 'Start writing your script...',
        'scriptEditor.clipCount': `${params?.count ?? 0} clips`,
        'scriptEditor.split': 'Split',
        'scriptEditor.mergeUp': '↑ Merge',
        'scriptEditor.mergeDown': '↓ Merge',
        'scriptEditor.deleteClip': 'Delete',
        'icons.arrowLeft': '←',
        'icons.arrowRight': '→',
        'icons.plus': '+',
        'scriptEditor.addScene': 'New Scene',
        'scriptEditor.copyScript': 'Copy Script',
      };
      return translations[key] || key;
    },
  }),
}));

describe('EditableScriptEditor', () => {
  const defaultProps = {
    initialScript: '',
    onBack: jest.fn(),
    onReady: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render text input', () => {
    render(<EditableScriptEditor {...defaultProps} />);
    expect(screen.getByTestId('script-input')).toBeTruthy();
  });

  it('should show initial script', () => {
    render(<EditableScriptEditor {...defaultProps} initialScript="Hello world" />);
    expect(screen.getByDisplayValue('Hello world')).toBeTruthy();
  });

  it('should disable button when empty', () => {
    render(<EditableScriptEditor {...defaultProps} />);
    const button = screen.getByTestId('ready-button');
    expect(button.props.accessibilityState?.disabled).toBe(true);
  });

  it('should enable button when has clips', () => {
    render(<EditableScriptEditor {...defaultProps} initialScript="Some text" />);
    const button = screen.getByTestId('ready-button');
    expect(button.props.accessibilityState?.disabled).toBe(false);
  });

  it('should call onReady with script when button pressed', () => {
    const onReady = jest.fn();
    render(<EditableScriptEditor {...defaultProps} initialScript="Some text" onReady={onReady} />);

    const button = screen.getByTestId('ready-button');
    fireEvent.press(button);

    expect(onReady).toHaveBeenCalledWith('Some text');
  });

  it('should not call onReady when script is empty', () => {
    const onReady = jest.fn();
    render(<EditableScriptEditor {...defaultProps} onReady={onReady} />);

    const button = screen.getByTestId('ready-button');
    fireEvent.press(button);

    expect(onReady).not.toHaveBeenCalled();
  });

  it('should call onBack when back button pressed', () => {
    const onBack = jest.fn();
    render(<EditableScriptEditor {...defaultProps} onBack={onBack} />);

    const backButton = screen.getByTestId('back-button');
    fireEvent.press(backButton);

    expect(onBack).toHaveBeenCalled();
  });

  it('should update script when text changes', () => {
    render(<EditableScriptEditor {...defaultProps} />);

    const input = screen.getByTestId('script-input');
    fireEvent.changeText(input, 'New script content');

    expect(screen.getByDisplayValue('New script content')).toBeTruthy();
  });

  it('should render header elements', () => {
    render(<EditableScriptEditor {...defaultProps} />);

    expect(screen.getByText('Script Editor')).toBeTruthy();
    expect(screen.getByText('Tap Split, Merge, or Delete to edit scenes')).toBeTruthy();
  });

  it('should not show tip banner', () => {
    render(<EditableScriptEditor {...defaultProps} />);
    expect(screen.queryByText('Tip:')).toBeNull();
  });

  it('should strip old slash markers on load', () => {
    render(
      <EditableScriptEditor {...defaultProps} initialScript={'First clip /\n\nSecond clip /'} />
    );
    // Slash markers are stripped; the script becomes two clips
    expect(screen.getByDisplayValue('First clip')).toBeTruthy();
    expect(screen.getByDisplayValue('Second clip')).toBeTruthy();
  });

  it('should show clip count', () => {
    render(<EditableScriptEditor {...defaultProps} initialScript={'First clip\n\nSecond clip'} />);
    // one input per clip
    expect(screen.getByTestId('clip-input-0')).toBeTruthy();
    expect(screen.getByTestId('clip-input-1')).toBeTruthy();
    expect(screen.queryByTestId('clip-input-2')).toBeNull();
  });

  it('should not show clip preview section', () => {
    render(<EditableScriptEditor {...defaultProps} initialScript={'First clip\n\nSecond clip'} />);
    expect(screen.queryByText('Clip Preview')).toBeNull();
  });

  describe('scene list', () => {
    it('should show scene inputs when there are clips', () => {
      render(<EditableScriptEditor {...defaultProps} initialScript="Some text" />);
      expect(screen.getByTestId('clip-input-0')).toBeTruthy();
    });

    it('should not show scene inputs when empty', () => {
      render(<EditableScriptEditor {...defaultProps} />);
      expect(screen.queryByTestId('clip-input-0')).toBeNull();
    });

    it('should show one input per clip', () => {
      render(
        <EditableScriptEditor {...defaultProps} initialScript={'First clip\n\nSecond clip'} />
      );
      expect(screen.getByTestId('clip-input-0')).toBeTruthy();
      expect(screen.getByTestId('clip-input-1')).toBeTruthy();
      expect(screen.queryByTestId('clip-input-2')).toBeNull();
    });

    it('should keep the clip text editable', () => {
      render(<EditableScriptEditor {...defaultProps} initialScript="Hello world" />);
      expect(screen.getByDisplayValue('Hello world')).toBeTruthy();
    });
  });

  it('should parse clips from paragraph breaks', () => {
    const scriptWithParagraphs = `First clip

Second clip`;
    render(<EditableScriptEditor {...defaultProps} initialScript={scriptWithParagraphs} />);

    expect(screen.getByTestId('clip-input-0')).toBeTruthy();
    expect(screen.getByTestId('clip-input-1')).toBeTruthy();
  });

  describe('clip action toolbar', () => {
    const selectClip = (index: number, start = 0) => {
      fireEvent(screen.getByTestId(`clip-input-${index}`), 'selectionChange', {
        nativeEvent: { selection: { start, end: start } },
      });
    };

    it('should show split and add buttons for the active clip', () => {
      render(
        <EditableScriptEditor {...defaultProps} initialScript={'First clip\n\nSecond clip'} />
      );
      expect(screen.getByTestId('toolbar-split')).toBeTruthy();
      expect(screen.getByTestId('toolbar-add')).toBeTruthy();
    });

    it('should hide delete when there is only one clip', () => {
      render(<EditableScriptEditor {...defaultProps} initialScript={'Only clip'} />);
      expect(screen.queryByTestId('toolbar-delete')).toBeNull();
    });

    it('should not show merge-up while the first clip is active', () => {
      render(
        <EditableScriptEditor {...defaultProps} initialScript={'First clip\n\nSecond clip'} />
      );
      expect(screen.queryByTestId('toolbar-merge-up')).toBeNull();
      selectClip(1);
      expect(screen.getByTestId('toolbar-merge-up')).toBeTruthy();
    });

    it('should not show merge-down while the last clip is active', () => {
      render(
        <EditableScriptEditor {...defaultProps} initialScript={'First clip\n\nSecond clip'} />
      );
      expect(screen.getByTestId('toolbar-merge-down')).toBeTruthy();
      selectClip(1);
      expect(screen.queryByTestId('toolbar-merge-down')).toBeNull();
    });

    it('should merge up with a space between the clips', () => {
      render(<EditableScriptEditor {...defaultProps} initialScript={'Hello\n\nWorld'} />);
      selectClip(1);
      fireEvent.press(screen.getByTestId('toolbar-merge-up'));
      expect(screen.queryByTestId('clip-input-1')).toBeNull();
      expect(screen.getByDisplayValue('Hello World')).toBeTruthy();
    });

    it('should merge down with a space between the clips', () => {
      render(<EditableScriptEditor {...defaultProps} initialScript={'Hello\n\nWorld'} />);
      fireEvent.press(screen.getByTestId('toolbar-merge-down'));
      expect(screen.queryByTestId('clip-input-1')).toBeNull();
      expect(screen.getByDisplayValue('Hello World')).toBeTruthy();
    });

    it('should not double up whitespace already present at the seam', () => {
      render(<EditableScriptEditor {...defaultProps} initialScript={'Hello \n\nWorld'} />);
      fireEvent.press(screen.getByTestId('toolbar-merge-down'));
      expect(screen.getByDisplayValue('Hello World')).toBeTruthy();
    });

    it('should not add a space when merging with an empty clip', () => {
      render(<EditableScriptEditor {...defaultProps} initialScript={'Hello\n\nWorld'} />);
      fireEvent.press(screen.getByTestId('toolbar-add'));
      selectClip(1);
      fireEvent.press(screen.getByTestId('toolbar-merge-up'));
      expect(screen.getByDisplayValue('Hello')).toBeTruthy();
    });

    it('should delete the active clip when delete button pressed', () => {
      // Non-empty clips confirm via Alert; auto-press the destructive action
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
        buttons?.find((b) => b.style === 'destructive')?.onPress?.();
      });
      render(
        <EditableScriptEditor {...defaultProps} initialScript={'First clip\n\nSecond clip'} />
      );
      selectClip(1);
      fireEvent.press(screen.getByTestId('toolbar-delete'));
      expect(screen.queryByTestId('clip-input-1')).toBeNull();
      expect(screen.getByDisplayValue('First clip')).toBeTruthy();
      alertSpy.mockRestore();
    });

    it('should split the active clip at the cursor when split button pressed', () => {
      render(<EditableScriptEditor {...defaultProps} initialScript={'HelloWorld'} />);
      selectClip(0, 5);
      fireEvent.press(screen.getByTestId('toolbar-split'));
      expect(screen.getByTestId('clip-input-0')).toBeTruthy();
      expect(screen.getByTestId('clip-input-1')).toBeTruthy();
      expect(screen.getByDisplayValue('Hello')).toBeTruthy();
      expect(screen.getByDisplayValue('World')).toBeTruthy();
    });
  });
});
