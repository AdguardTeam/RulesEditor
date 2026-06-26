import type * as CodeMirror from 'codemirror';

import { RulesBuilder } from '../rulesBuilder/RulesBuilder';

/**
 * Function to create checkmark for enabled rules.
 *
 * @param options Object with color and innerHTML properties.
 * @param options.color Color of the checkmark marker.
 * @param options.innerHTML Inner HTML of the checkmark marker.
 *
 * @returns HTML element with checkmark.
 */
export const createMarker = (options: { color?: string; innerHTML?: string }) => () => {
    const marker = document.createElement('div');
    marker.style.color = options.color || '#67B279';
    marker.style.marginLeft = '-12px';
    marker.style.marginTop = '4px';
    marker.innerHTML = options.innerHTML || '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 16 16" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M13.9888 3.24536C14.4056 3.60773 14.4497 4.23936 14.0873 4.65614L7.13182 12.6561C6.94683 12.8689 6.68062 12.9937 6.39875 12.9998C6.11688 13.0059 5.84553 12.8927 5.65154 12.6881L1.94039 8.77448C1.56037 8.37373 1.57718 7.74079 1.97793 7.36077C2.37868 6.98075 3.01163 6.99756 3.39165 7.39831L6.34505 10.5128L12.578 3.34389C12.9404 2.92711 13.572 2.88299 13.9888 3.24536Z" fill="var(--stroke-icons-product-icon-default)"/></svg>';
    return marker;
};

export const configureHotKeys = (options: {
    commentCallback: (cm: CodeMirror.Editor) => void;
    markerOptions: { color?: string; innerHTML?: string };
}) => {
    const makeMarker = createMarker(options.markerOptions);

    /**
     * Function to toggle comment for a rule.
     *
     * @param cm CodeMirror instance.
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
     *
     * @param cm CodeMirror instance.
     */
    const onCopy = (cm: CodeMirror.Editor) => {
        const selection = cm.getSelection();
        window.navigator.clipboard.writeText(selection);
    };

    /**
     * Function to paste text from clipboard to editor.
     *
     * @param cm CodeMirror instance.
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
     *
     * @param cm CodeMirror instance.
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
     * Function to move selected line up.
     *
     * @param cm CodeMirror instance.
     */
    const moveLineUp = (cm: CodeMirror.Editor) => {
        const cursorLine = cm.getCursor().line;

        if (cursorLine === 0) {
            return;
        }
        // Perform the line movement operation as a single operation
        cm.operation(() => {
            const bottomLineIndex = cursorLine;
            const topLineIndex = cursorLine - 1; // line above cursor

            const movingUpLine = cm.getLine(bottomLineIndex);
            const movingUpLineInfo = cm.lineInfo(bottomLineIndex);
            const shouldMarkMovingUpLine = RulesBuilder.getRuleType(movingUpLineInfo.text) !== 'comment'
                && movingUpLineInfo.gutterMarkers;

            const movingDownLine = cm.getLine(topLineIndex);
            const movingDownLineInfo = cm.lineInfo(topLineIndex);
            const shouldMarkMovingDownLine = RulesBuilder.getRuleType(movingDownLineInfo.text) !== 'comment'
                && movingDownLineInfo.gutterMarkers;

            cm.replaceRange(
                movingDownLine,
                { line: bottomLineIndex, ch: 0 },
                { line: bottomLineIndex, ch: movingUpLine.length },
                '+swapLine',
            );
            cm.setGutterMarker(bottomLineIndex, 'breakpoints', shouldMarkMovingDownLine ? makeMarker() : null);

            cm.replaceRange(
                movingUpLine,
                { line: topLineIndex, ch: 0 },
                { line: topLineIndex, ch: movingDownLine.length },
                '+swapLine',
            );
            cm.setGutterMarker(topLineIndex, 'breakpoints', shouldMarkMovingUpLine ? makeMarker() : null);

            cm.setCursor({ ...cm.getCursor(), line: topLineIndex });
            cm.scrollIntoView(null);
        });
    };

    /**
     * Function to copy selected lines up.
     *
     * @param cm CodeMirror instance.
     */
    const copyLineUp = (cm: CodeMirror.Editor) => {
        const cursorStartPos = cm.getDoc().getCursor();
        cm.operation(() => {
            const rangeCount = cm.listSelections().length;
            for (let i = 0; i < rangeCount; i += 1) {
                const range = cm.listSelections()[i];
                if (range.empty()) {
                    const info = cm.lineInfo(range.head.line);
                    const shouldMark = RulesBuilder.getRuleType(info.text) !== 'comment' && info.gutterMarkers;
                    cm.replaceRange(`${cm.getLine(range.head.line)}\n`, { line: range.head.line, ch: 0 });
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
     * Function to move selected line down.
     *
     * @param cm CodeMirror instance.
     */
    const moveLineDown = (cm: CodeMirror.Editor) => {
        const cursorLine = cm.getCursor().line;
        if (cursorLine === cm.lastLine()) {
            return;
        }
        cm.operation(() => {
            const bottomLineIndex = cursorLine + 1; // line below cursor
            const topLineIndex = cursorLine;

            const movingUpLine = cm.getLine(bottomLineIndex);
            const movingUpLineInfo = cm.lineInfo(bottomLineIndex);
            const shouldMarkMovingUpLine = RulesBuilder.getRuleType(movingUpLineInfo.text) !== 'comment'
                && movingUpLineInfo.gutterMarkers;

            let movingDownLine = cm.getLine(topLineIndex);
            const isLastLine = bottomLineIndex === cm.lastLine();
            if (isLastLine) {
                movingDownLine = movingDownLine.replace('\n', '');
            }
            const movingDownLineInfo = cm.lineInfo(topLineIndex);
            const shouldMarkMovingDownLine = RulesBuilder.getRuleType(movingDownLineInfo.text) !== 'comment'
                && movingDownLineInfo.gutterMarkers;

            cm.replaceRange(
                movingDownLine,
                { line: bottomLineIndex, ch: 0 },
                { line: bottomLineIndex, ch: movingUpLine.length },
                '+swapLine',
            );
            cm.setGutterMarker(bottomLineIndex, 'breakpoints', shouldMarkMovingDownLine ? makeMarker() : null);

            cm.replaceRange(
                movingUpLine,
                { line: topLineIndex, ch: 0 },
                { line: topLineIndex, ch: movingDownLine.length },
                '+swapLine',
            );
            cm.setGutterMarker(topLineIndex, 'breakpoints', shouldMarkMovingUpLine ? makeMarker() : null);

            cm.setCursor({ ...cm.getCursor(), line: bottomLineIndex });
            cm.scrollIntoView(null);
        });
    };

    /**
     * Function to copy selected lines down.
     *
     * @param cm CodeMirror instance.
     */
    const copyLineDown = (cm: CodeMirror.Editor) => {
        const cursorStartPos = cm.getDoc().getCursor();
        cm.operation(() => {
            const rangeCount = cm.listSelections().length;
            for (let i = 0; i < rangeCount; i += 1) {
                const range = cm.listSelections()[i];
                if (range.empty()) {
                    const info = cm.lineInfo(range.head.line);
                    const shouldMark = RulesBuilder.getRuleType(info.text) !== 'comment' && info.gutterMarkers;
                    cm.replaceRange(`${cm.getLine(range.head.line)}\n`, { line: range.head.line, ch: 0 });
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
