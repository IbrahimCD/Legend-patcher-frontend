// FILE: src/components/LinePatcher.jsx

import React, { useState } from 'react';
import { Box, Typography, TextField, Button, Card, Stack, CssBaseline } from '@mui/material';
import { createTheme, ThemeProvider, styled } from '@mui/material/styles';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { lineNumbers } from '@codemirror/view';

// A simple dark theme (can be reused from your existing code)
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#F05032' },
    background: { default: '#0D1117', paper: '#161B22' },
  },
  typography: {
    fontFamily: [
      'SFMono-Regular','Consolas','Liberation Mono','Menlo','Courier','monospace'
    ].join(',')
  }
});

// Same Editor styling as in Patcher
const EditorWrapper = styled(Box)(() => ({
  '& .cm-editor': {
    minHeight: '150px',
    backgroundColor: '#000 !important'
  },
  '& .cm-content': {
    backgroundColor: '#000 !important',
    color: '#fff !important'
  },
  '& .cm-gutters': {
    backgroundColor: '#000 !important',
    color: '#888 !important',
    border: 'none !important'
  }
}));

export default function LinePatcher() {
  // State for the user’s line-numbered code
  const [numberedCode, setNumberedCode] = useState('');

  // State for instructions, e.g.
  //   Remove line 1
  //   Replace line 2 with: console.log("Hello replaced!")
  //   Add after line 5:
  //     console.log("Line 6");
  //     console.log("Line 7");
  const [instructionsText, setInstructionsText] = useState('');

  // Final result code
  const [resultCode, setResultCode] = useState('');

  // A helper to parse the code lines. We assume the code has lines like:
  // "1function foo() {", "2console.log('hello');", ...
  // We'll store them in an array of objects: [{num: 1, text: 'function foo() {'}, ...]
  function parseNumberedCode() {
    const lines = numberedCode.split('\n').map(raw => {
      // For safety, separate the leading digits from the rest
      // e.g. "12some code here"
      // We'll parse out "12" and "some code here"
      const match = raw.match(/^(\d+)(.*)$/);
      if (!match) {
        return { num: null, text: raw.trim() };
      }
      return {
        num: parseInt(match[1], 10),
        text: match[2].trim()
      };
    });
    return lines;
  }

  // We'll parse the instructions from the multiline text field
  // We'll handle these patterns (one instruction per line):
  //  1) "Remove line X"
  //  2) "Replace line X with: SOMETHING"
  //  3) "Add after line X:" (then additional lines follow until a blank line or end)
  function parseInstructions() {
    // We can parse each line individually,
    // but "Add after line X:" might be multi-line until next blank line or next instruction.
    // For simplicity, let's do a single pass:
    const lines = instructionsText.split('\n');
    const ops = [];
    let i = 0;
    while (i < lines.length) {
      const raw = lines[i].trim();
      if (!raw) {
        // empty line -> skip
        i++;
        continue;
      }

      // Remove line X
      let match = raw.match(/^remove line\s+(\d+)/i);
      if (match) {
        ops.push({
          type: 'remove',
          lineNum: parseInt(match[1], 10)
        });
        i++;
        continue;
      }

      // Replace line X with:
      match = raw.match(/^replace line\s+(\d+)\s+with:\s*(.*)/i);
      if (match) {
        const lineNum = parseInt(match[1], 10);
        // Everything after "with:" on the same line is the new text
        const newText = match[2] || '';
        ops.push({
          type: 'replace',
          lineNum,
          newLines: [ newText ]
        });
        i++;
        continue;
      }

      // Add after line X:
      match = raw.match(/^add after line\s+(\d+):\s*(.*)/i);
      if (match) {
        const lineNum = parseInt(match[1], 10);

        // The rest of the line after the colon is the first new line. Possibly empty
        const firstLine = match[2] || '';

        // Then we might have subsequent lines until we hit an empty line OR next instruction
        const newLines = [ firstLine ];
        i++;
        // collect additional lines until blank or next recognized instruction pattern
        while (i < lines.length) {
          const testLine = lines[i];
          if (!testLine.trim()) {
            // blank => end of multi-line block
            break;
          }
          // If the next line looks like a new instruction (remove/replace/add), break
          if (
            /^remove line/i.test(testLine) ||
            /^replace line/i.test(testLine) ||
            /^add after line/i.test(testLine)
          ) {
            // that’s a new instruction => break
            break;
          }
          // otherwise, add this line to newLines
          newLines.push(testLine);
          i++;
        }
        // We’ve consumed the lines that belong to this "Add after line"
        ops.push({
          type: 'insert',
          lineNum,
          newLines
        });
        continue; // skip i++ because we did it in the loop
      }

      // If none of the patterns matched, we skip this line
      i++;
    }
    return ops;
  }

  // The main function that runs on "Apply"
  function handleApply() {
    const parsedLines = parseNumberedCode();
    if (!parsedLines.length) {
      setResultCode('');
      return;
    }
    const ops = parseInstructions();

    // We'll build an array of just the text, ignoring line numbers from the user’s paste
    // Because we already have them in parseNumberedCode() as `parsedLines`.
    const newCodeArray = parsedLines.map(item => item.text);

    // Apply each op in sequence
    // Note that lineNum references the "parsedLines" numbering, so we find the index.
    ops.forEach(op => {
      const lineIndex = parsedLines.findIndex(item => item.num === op.lineNum);
      if (lineIndex < 0) {
        // the user said "Remove line 999" but there's no line 999
        return; // skip
      }

      if (op.type === 'remove') {
        // remove the line at lineIndex
        newCodeArray.splice(lineIndex, 1);
        // also remove from parsedLines so subsequent instructions can reference correct lines
        parsedLines.splice(lineIndex, 1);
      }
      else if (op.type === 'replace') {
        // replace that line with new text
        newCodeArray.splice(lineIndex, 1, ...op.newLines);
        // update parsedLines in case further instructions refer to the same lines
        parsedLines.splice(
          lineIndex,
          1,
          ...op.newLines.map((txt, idx) => {
            // the original line had num=..., so let's keep the same lineNum for the first replaced line
            // subsequent lines get no lineNum, or we can do something else. For simplicity, we’ll do null.
            return idx === 0
              ? { num: op.lineNum, text: txt }
              : { num: null, text: txt };
          })
        );
      }
      else if (op.type === 'insert') {
        // insert new lines after lineIndex
        // lineIndex is zero-based, so "after line X" = lineIndex+1
        newCodeArray.splice(lineIndex + 1, 0, ...op.newLines);
        // also splice into parsedLines
        const newParsed = op.newLines.map(txt => ({ num: null, text: txt }));
        parsedLines.splice(lineIndex + 1, 0, ...newParsed);
      }
    });

    // Combine final
    setResultCode(newCodeArray.join('\n'));
  }

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box sx={{ display:'flex', width:'100vw', height:'100vh' }}>
        <Box sx={{ width:'50%', minWidth:400, borderRight:'1px solid #30363d', p:2, overflowY:'auto' }}>
          <Typography variant="h5" gutterBottom>Line-Based Patcher</Typography>

          <Typography variant="subtitle1" sx={{ mt:2 }}>
            Paste your **line-numbered** code here:
          </Typography>
          <EditorWrapper>
            <CodeMirror
              value={numberedCode}
              extensions={[lineNumbers(), javascript({ jsx: true })]}
              onChange={(val) => setNumberedCode(val)}
            />
          </EditorWrapper>

          <Typography variant="subtitle1" sx={{ mt:2 }}>
            Instructions (one instruction per line).<br/>
            Examples:
          </Typography>
          <Typography variant="body2" sx={{ fontStyle:'italic', ml:2 }}>
            Remove line 1<br/>
            Replace line 2 with: console.log("foo");<br/>
            Add after line 5:<br/>
            &nbsp;&nbsp;console.log("Line 6");<br/>
            &nbsp;&nbsp;console.log("Line 7");
          </Typography>

          <TextField
            label="Instructions"
            multiline
            rows={8}
            fullWidth
            sx={{ mt:1 }}
            value={instructionsText}
            onChange={(e) => setInstructionsText(e.target.value)}
          />

          <Box sx={{ display:'flex', justifyContent:'flex-end', mt:2 }}>
            <Button variant="contained" onClick={handleApply}>Apply</Button>
          </Box>
        </Box>

        <Box sx={{ flex:1, p:2, overflowY:'auto' }}>
          <Typography variant="h5" gutterBottom>Result</Typography>
          <Card variant="outlined" sx={{ p:2, bgcolor:'#161B22', border:'1px solid #30363d' }}>
            <EditorWrapper>
              <CodeMirror
                value={resultCode}
                readOnly
                extensions={[lineNumbers(), javascript({ jsx:true })]}
              />
            </EditorWrapper>
          </Card>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
