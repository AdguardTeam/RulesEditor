import type * as CodeMirror from 'codemirror';
import { RulesBuilder } from '../rulesBuilder/RulesBuilder';

/**
 * Function to create checkmark for enabled rules.
 * @param options - Object with color and innerHTML properties.
 * @returns - HTML element with checkmark.
 */
export const createMarker = (options: { color?: string, innerHTML?: string }) => () => {
    const marker = document.createElement('div');
    marker.style.color = options.color || '#67B279';
    marker.style.marginLeft = '-12px';
    marker.style.marginTop = '4px';
    marker.innerHTML = options.innerHTML || '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 16 16" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M13.9888 3.24536C14.4056 3.60773 14.4497 4.23936 14.0873 4.65614L7.13182 12.6561C6.94683 12.8689 6.68062 12.9937 6.39875 12.9998C6.11688 13.0059 5.84553 12.8927 5.65154 12.6881L1.94039 8.77448C1.56037 8.37373 1.57718 7.74079 1.97793 7.36077C2.37868 6.98075 3.01163 6.99756 3.39165 7.39831L6.34505 10.5128L12.578 3.34389C12.9404 2.92711 13.572 2.88299 13.9888 3.24536Z" fill="var(--stroke-icons-product-icon-default)"/></svg>';
    return marker;
};

export const configureHotKeys = (options: {
    commentCallback: (cm: CodeMirror.Editor) => void,
    markerOptions: { color?: string, innerHTML?: string },
}) => {
    const makeMarker = createMarker(options.markerOptions);

    /**
     * Function to toggle comment for a rule.
     * @param options - Object with callback and markerOptions properties.
     * @returns - Function to toggle comment for a rule.
     */
    const onComment = (cm: CodeMirror.Editor) => {
        const { line } = cm.getCursor();
        const info = cm.lineInfo(line);
        if (RulesBuilder.getRuleType(info.text) !== 'comment') {
            cm.setGutterMarker(line, 'breakpoints', info.gutterMarkers ? null : makeMarker());
            options.commentCallback(cm);
        }
    };

    /**
     * Function to copy selected text to clipboard.
     * @param cm - CodeMirror instance.
     */
    const onCopy = (cm: CodeMirror.Editor) => {
        const selection = cm.getSelection();
        window.navigator.clipboard.writeText(selection);
    };

    /**
     * Function to paste text from clipboard to editor.
     * @param cm - CodeMirror instance.
     */
    const onPaste = async (cm: CodeMirror.Editor) => {
        const lines = await window.navigator.clipboard.readText();
        const linesArray = lines.split('\n');

        if (cm.getSelection()) {
            const positionTo = cm.getCursor('to');
            const positionFrom = cm.getCursor('from');
            const isSameLine = positionFrom.line === positionTo.line;
            // We paste only some substring in line
            if (isSameLine && linesArray.length === 1) {
                cm.replaceRange(await window.navigator.clipboard.readText(), positionFrom, positionTo);
            } else {
                // We replace part/hole line with new lines
                cm.operation(() => {
                    cm.replaceRange(lines, positionFrom, positionTo);
                    linesArray.forEach((_, index) => {
                        const info = cm.lineInfo(positionFrom.line + index);
                        if (RulesBuilder.getRuleType(info.text) !== 'comment') {
                            cm.setGutterMarker(positionFrom.line + index, 'breakpoints', makeMarker());
                        }
                    });
                });
            }
        } else {
            const positionHead = cm.getCursor();
            cm.operation(() => {
                cm.replaceRange(lines, positionHead, positionHead);
                linesArray.forEach((_, index) => {
                    const info = cm.lineInfo(positionHead.line + index);
                    if (RulesBuilder.getRuleType(info.text) !== 'comment') {
                        cm.setGutterMarker(positionHead.line + index, 'breakpoints', makeMarker());
                    }
                });
            });
        }
    };

    /**
     * Function to cut selected text to clipboard.
     * @param cm - CodeMirror instance.
     */
    const onCut = (cm: CodeMirror.Editor) => {
        const selection = cm.getSelection();
        window.navigator.clipboard.writeText(selection);
        const ranges = cm.listSelections();
        ranges.forEach((range: any) => {
            cm.replaceRange('', range.from(), range.to(), '+swapLine');
        });
    };

    /**
     * Function to move selected lines up.
     * @param cm - CodeMirror instance.
     */
    const moveLineUp = (cm: CodeMirror.Editor) => {
        // Get all current selections in the editor
        const ranges = cm.listSelections();
        // Array to store line indices that need to be moved
        const linesToMove: number[] = [];
        // Initial position for movement (before the first line)
        let at = cm.firstLine() - 1;
        // Array to store new cursor positions after movement
        const newSels: { anchor: any; head: any }[] = [];

        // Process each selection
        for (let i = 0; i < ranges.length; i++) {
            const range = ranges[i];
            // Get the starting line of the selection (minus 1, since we're moving up)
            const from = range.from().line - 1;
            // Get the ending line of the selection
            let to = range.to().line;

            // Create a new cursor position after movement
            newSels.push({
                anchor: { line: (range.anchor.line - 1), ch: (range.anchor.ch) },
                head: { line: (range.head.line - 1), ch: (range.head.ch) },
            });

            // If the cursor is at the beginning of the line and the selection is not empty, decrease to
            if (range.to().ch === 0 && !range.empty()) { --to; }

            // Add the range of lines to move or update the existing one
            if (from > at) {
                linesToMove.push(from, to);
            } else if (linesToMove.length) {
                linesToMove[linesToMove.length - 1] = to;
            }
            at = to;
        }

        // Perform the line movement operation as a single operation
        cm.operation(() => {
            // Process each pair of indices (start and end of range)
            for (let i = 0; i < linesToMove.length; i += 2) {
                const from = linesToMove[i];
                const to = linesToMove[i + 1];
                // Get the text of the line located at the position above the one being moved
                const line = cm.getLine(from);
                const info = cm.lineInfo(from);
                const shouldMark = RulesBuilder.getRuleType(info.text) !== 'comment' && info.gutterMarkers;

                // Remove the line above the one being moved
                cm.replaceRange('', { line: from, ch: 0 }, { line: from + 1, ch: 0 }, '+swapLine');

                // Insert the deleted line at the new position
                if (to > cm.lastLine()) {
                    // If moving beyond the last line, add to the end
                    cm.replaceRange('\n' + line, { line: cm.lastLine(), ch: 0 }, undefined, '+swapLine');
                    if (shouldMark) {
                        cm.setGutterMarker(cm.lastLine() + 1, 'breakpoints', makeMarker());
                    }
                } else {
                    cm.replaceRange(line + '\n', { line: to, ch: 0 }, undefined, '+swapLine');
                    if (shouldMark) {
                        cm.setGutterMarker(to, 'breakpoints', makeMarker());
                    }
                }
            }

            // Set new cursor positions
            cm.setSelections(newSels);
            // Scroll the editor to show the cursor
            cm.scrollIntoView(null);
        });
    };

    /**
     * Function to copy selected lines up.
     * @param cm - CodeMirror instance.
     */
    const copyLineUp = (cm: CodeMirror.Editor) => {
        const cursorStartPos = cm.getDoc().getCursor();
        cm.operation(() => {
            const rangeCount = cm.listSelections().length;
            for (let i = 0; i < rangeCount; i++) {
                const range = cm.listSelections()[i];
                if (range.empty()) {
                    const info = cm.lineInfo(range.head.line);
                    const shouldMark = RulesBuilder.getRuleType(info.text) !== 'comment' && info.gutterMarkers;
                    cm.replaceRange(cm.getLine(range.head.line) + '\n', { line: range.head.line, ch: 0 });
                    if (shouldMark) {
                        cm.setGutterMarker(cursorStartPos.line, 'breakpoints', makeMarker());
                    }
                } else {
                    cm.replaceRange(cm.getRange(range.from(), range.to()), range.from());
                }
            }
        });
        cm.getDoc().setCursor(cursorStartPos);
    };

    /**
     * Function to move selected lines down.
     * @param cm - CodeMirror instance.
     */
    const moveLineDown = (cm: CodeMirror.Editor) => {
        const ranges = cm.listSelections();
        const linesToMove: number[] = [];
        let at = cm.lastLine() + 1;
        for (let i = ranges.length - 1; i >= 0; i--) {
            const range = ranges[i];
            let from = range.to().line + 1;
            const to = range.from().line;
            if (range.to().ch === 0 && !range.empty()) {
                from--;
            }
            if (from < at) {
                linesToMove.push(from, to);
            } else if (linesToMove.length) {
                linesToMove[linesToMove.length - 1] = to;
            }
            at = to;
        }
        cm.operation(() => {
            for (let i = linesToMove.length - 2; i >= 0; i -= 2) {
                const from = linesToMove[i]; // line below
                const to = linesToMove[i + 1]; // line to move
                const line = cm.getLine(from);

                const info = cm.lineInfo(from);
                const shouldMark = RulesBuilder.getRuleType(info.text) !== 'comment' && info.gutterMarkers;

                if (from === cm.lastLine()) {
                    cm.replaceRange('', { line: (from - 1), ch: 0 }, { line: from, ch: 0 }, '+swapLine');
                } else {
                    cm.replaceRange('', { line: from, ch: 0 }, { line: from + 1, ch: 0 }, '+swapLine');
                }
                cm.replaceRange(line + '\n', { line: to, ch: 0 }, undefined, '+swapLine'); // put line which was below to the line above
                if (shouldMark) {
                    cm.setGutterMarker(to, 'breakpoints', makeMarker());
                }
            }
            cm.scrollIntoView(null);
        });
    };

    /**
     * Function to copy selected lines down.
     * @param cm - CodeMirror instance.
     */
    const copyLineDown = (cm: CodeMirror.Editor) => {
        const cursorStartPos = cm.getDoc().getCursor();
        cm.operation(() => {
            const rangeCount = cm.listSelections().length;
            for (let i = 0; i < rangeCount; i++) {
                const range = cm.listSelections()[i];
                if (range.empty()) {
                    const info = cm.lineInfo(range.head.line);
                    const shouldMark = RulesBuilder.getRuleType(info.text) !== 'comment' && info.gutterMarkers;
                    cm.replaceRange(cm.getLine(range.head.line) + '\n', { line: range.head.line, ch: 0 });
                    if (shouldMark) {
                        cm.setGutterMarker(cursorStartPos.line, 'breakpoints', makeMarker());
                    }
                } else {
                    cm.replaceRange(cm.getRange(range.from(), range.to()), range.from());
                }
            }
            cm.scrollIntoView(null);
        });
    };

    return {
        onComment,
        onCopy,
        onPaste,
        onCut,
        moveLineUp,
        copyLineUp,
        moveLineDown,
        copyLineDown,
        makeMarker,
    };
};
