import CodeMirror from "codemirror";

var Pos = CodeMirror.Pos;

CodeMirror.commands.moveLineDown = function (cm) {
    cm.moveLineDown();
};

CodeMirror.commands.moveLineUp = function (cm) {
    cm.moveLineUp();
};

CodeMirror.commands.copyLineDown = function (cm) {
    cm.copyLineDown();
};

CodeMirror.commands.copyLineUp = function (cm) {
    cm.copyLineUp();
};

CodeMirror.defineExtension("moveLineUp", function () {
    var cm = this;
    if (cm.isReadOnly()) return CodeMirror.Pass
    var ranges = cm.listSelections(), linesToMove = [], at = cm.firstLine() - 1, newSels = [];
    for (var i = 0; i < ranges.length; i++) {
        var range = ranges[i], from = range.from().line - 1, to = range.to().line;
        newSels.push({
            anchor: Pos(range.anchor.line - 1, range.anchor.ch),
            head: Pos(range.head.line - 1, range.head.ch)
        });
        if (range.to().ch == 0 && !range.empty()) --to;
        if (from > at) linesToMove.push(from, to);
        else if (linesToMove.length) linesToMove[linesToMove.length - 1] = to;
        at = to;
    }
    cm.operation(function () {
        for (var i = 0; i < linesToMove.length; i += 2) {
            var from = linesToMove[i], to = linesToMove[i + 1];
            var line = cm.getLine(from);
            cm.replaceRange("", Pos(from, 0), Pos(from + 1, 0), "+swapLine");
            if (to > cm.lastLine())
                cm.replaceRange("\n" + line, Pos(cm.lastLine()), null, "+swapLine");
            else
                cm.replaceRange(line + "\n", Pos(to, 0), null, "+swapLine");
        }
        cm.setSelections(newSels);
        cm.scrollIntoView();
    });
});

CodeMirror.defineExtension("moveLineDown", function () {
    var cm = this;
    if (cm.isReadOnly()) return CodeMirror.Pass
    var ranges = cm.listSelections(), linesToMove = [], at = cm.lastLine() + 1;
    for (var i = ranges.length - 1; i >= 0; i--) {
        var range = ranges[i], from = range.to().line + 1, to = range.from().line;
        if (range.to().ch == 0 && !range.empty()) from--;
        if (from < at) linesToMove.push(from, to);
        else if (linesToMove.length) linesToMove[linesToMove.length - 1] = to;
        at = to;
    }
    cm.operation(function () {
        for (var i = linesToMove.length - 2; i >= 0; i -= 2) {
            var from = linesToMove[i], to = linesToMove[i + 1];
            var line = cm.getLine(from);
            if (from == cm.lastLine())
                cm.replaceRange("", Pos(from - 1), Pos(from), "+swapLine");
            else
                cm.replaceRange("", Pos(from, 0), Pos(from + 1, 0), "+swapLine");
            cm.replaceRange(line + "\n", Pos(to, 0), null, "+swapLine");
        }
        cm.scrollIntoView();
    });
});

CodeMirror.defineExtension("copyLineUp", function () {
    var cm = this;
    var cursorStartPos = cm.getDoc().getCursor();
    cm.operation(function () {
        var rangeCount = cm.listSelections().length;
        for (var i = 0; i < rangeCount; i++) {
            var range = cm.listSelections()[i];
            if (range.empty())
                cm.replaceRange(cm.getLine(range.head.line) + "\n", Pos(range.head.line, 0));
            else
                cm.replaceRange(cm.getRange(range.from(), range.to()), range.from());
        }
    });
    cm.getDoc().setCursor(cursorStartPos)
});

CodeMirror.defineExtension("copyLineDown", function () {
    var cm = this;
    cm.operation(function () {
        var rangeCount = cm.listSelections().length;
        for (var i = 0; i < rangeCount; i++) {
            var range = cm.listSelections()[i];
            if (range.empty())
                cm.replaceRange(cm.getLine(range.head.line) + "\n", Pos(range.head.line, 0));
            else
                cm.replaceRange(cm.getRange(range.from(), range.to()), range.from());
        }
        cm.scrollIntoView();
    });
});