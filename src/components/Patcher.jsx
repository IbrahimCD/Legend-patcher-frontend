// FILE: src/components/Patcher.jsx

import React, { useState, useEffect, useRef, useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { lineNumbers } from '@codemirror/view';
import {
  TextField,
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Checkbox,
  Typography,
  Card,
  Stack,
  Box,
  createTheme,
  ThemeProvider,
  styled,
  CssBaseline,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  RadioGroup,
  FormControlLabel,
  Radio
} from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';

/* ------------------ Normalization & Distance Matching ------------------ */

// We ignore leading/trailing whitespace, collapse multiple spaces, remove zero-width chars, and lowercase.
// We do NOT remove punctuation so code tokens remain intact.
function normalize(line) {
  let out = line.replace(/[\u200B-\u200D\uFEFF]/g, '');
  out = out.trim();
  out = out.toLowerCase();
  out = out.replace(/\s+/g, ' ');
  return out;
}

// Simple Levenshtein distance (edit distance)
function levenshtein(a, b) {
  const m = [];
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  // build matrix
  for (let i = 0; i <= b.length; i++) {
    m[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    m[0][j] = j;
  }

  // fill
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        m[i][j] = m[i - 1][j - 1];
      } else {
        m[i][j] = Math.min(
          m[i - 1][j - 1] + 1,
          m[i][j - 1] + 1,
          m[i - 1][j] + 1
        );
      }
    }
  }
  return m[b.length][a.length];
}

// Find all exact fuzzy matches by normalized equality
function findAllFuzzyMatches(lines, targetNorm) {
  const res = [];
  lines.forEach((txt, idx) => {
    if (normalize(txt) === targetNorm) {
      res.push(idx);
    }
  });
  return res;
}

/**
 * findLineMatches:
 * 1) find all exact fuzzy matches
 * 2) if none found, find lines that are “close” by Levenshtein distance
 *    - We measure distance on the normalized text
 *    - We also measure length of the strings so we can pick lines with similarity >= threshold
 *    - We store them in ascending distance order
 */
function findLineMatches(lines, target) {
  const targetNorm = normalize(target);
  const exactMatches = findAllFuzzyMatches(lines, targetNorm);
  if (exactMatches.length > 0) {
    return { exact: exactMatches, close: [] };
  }

  // no exact matches => compute distances
  const distances = lines.map((txt, idx) => {
    const dist = levenshtein(normalize(txt), targetNorm);
    return { idx, text: txt, dist };
  });

  // sort by distance ascending
  distances.sort((a, b) => a.dist - b.dist);

  // We'll define a threshold. Example:
  // If distance is less than or equal to half the length of target, we consider it “close enough”
  // You can tweak as needed
  const threshold = Math.floor(targetNorm.length / 2) || 1;

  const close = distances.filter(d => d.dist <= threshold);
  return { exact: [], close };
}

/* ------------------ Parse Legend Commands ------------------ */

function parseCommands(lines) {
  const ops = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i].trim();
    if (raw.startsWith('D-')) {
      ops.push({ type: 'delete', content: raw.slice(2).trim() });
      i++;
    } else if (raw.startsWith('M-')) {
      const oldLine = raw.slice(2).trim();
      const newLines = [];
      i++;
      while (i < lines.length && lines[i].trim().startsWith('M+-')) {
        newLines.push(lines[i].trim().slice(3).trim());
        i++;
      }
      ops.push({ type: 'replace', oldLines: [oldLine], newLines });
    } else if (raw.startsWith('AF+')) {
      const anchor = raw.slice(3).trim();
      const newLines = [];
      i++;
      while (i < lines.length && lines[i].trim().startsWith('NAD+')) {
        newLines.push(lines[i].trim().slice(4).trim());
        i++;
      }
      ops.push({ type: 'insert', anchor, newLines });
    } else {
      i++;
    }
  }
  return ops;
}

/* ------------------ Annotated Result (deleted/inserted lines) ------------------ */

function buildAnnotatedResult(original, ops) {
  const annotated = original.map(txt => ({ text: txt, status: 'unchanged' }));

  function findFirstFuzzyIndex(txt) {
    const normTxt = normalize(txt);
    return annotated.findIndex(
      (item) => normalize(item.text) === normTxt && item.status === 'unchanged'
    );
  }

  ops.forEach(op => {
    if (op.type === 'delete') {
      const i = findFirstFuzzyIndex(op.content);
      if (i !== -1) annotated[i].status = 'deleted';
    }
    else if (op.type === 'replace') {
      const i = findFirstFuzzyIndex(op.oldLines[0]);
      if (i !== -1) {
        annotated[i].status = 'deleted';
        const ins = op.newLines.map(n => ({ text: n, status: 'inserted' }));
        annotated.splice(i + 1, 0, ...ins);
      }
    }
    else if (op.type === 'insert') {
      const i = findFirstFuzzyIndex(op.anchor);
      if (i !== -1) {
        const ins = op.newLines.map(n => ({ text: n, status: 'inserted' }));
        annotated.splice(i + 1, 0, ...ins);
      }
    }
  });

  return annotated.filter(a => a.status !== 'unchanged');
}

/* ------------------ Theme & Editor Styles ------------------ */

const gitTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#F05032' },
    background: { default: '#0D1117', paper: '#161B22' },
    error: { main: '#f85149' },
    success: { main: '#2ea44f' }
  },
  typography: {
    fontFamily: [
      'SFMono-Regular','Consolas','Liberation Mono','Menlo','Courier','monospace'
    ].join(','),
    allVariants: { color: '#C9D1D9' }
  }
});

const EditorWrapper = styled(Box)(() => ({
  '& .cm-editor': {
    minHeight: '200px',
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

/* ------------------ Main Component ------------------ */

export default function Patcher() {
  const [origText, setOrigText] = useState('');
  const [scriptText, setScriptText] = useState('');

  const [hunks, setHunks] = useState([]);
  const [enabled, setEnabled] = useState({});

  const [resultText, setResultText] = useState('');
  const [annotated, setAnnotated] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  const [onlyChanges, setOnlyChanges] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  // For multi-match & close-match dialogs
  const [pendingOp, setPendingOp] = useState(null);       // The operation object
  const [possibleChoices, setPossibleChoices] = useState([]); // { idx, text, dist?, exact: boolean? }
  const [userChoice, setUserChoice] = useState('');
  const [resolveChoice, setResolveChoice] = useState(null);   // promise resolver

  useEffect(() => {
    const ops = parseCommands(scriptText.split('\n'));
    setHunks(ops);
    setEnabled(ops.reduce((m, _, i) => ((m[i] = true), m), {}));
    setResultText('');
    setAnnotated([]);
    setStats(null);
    setError(null);
  }, [scriptText]);

  const toggleHunk = idx => setEnabled(prev => ({ ...prev, [idx]: !prev[idx] }));

  // Compute line-numbered version of the original code
  const lineNumberedCode = useMemo(() => {
    if (!origText.trim()) return '';
    return origText
      .split('\n')
      .map((l, i) => `${i + 1}${l.trim().toLowerCase()}`)
      .join('\n');
  }, [origText]);

  // Copy final patched code to clipboard
  const handleCopyResult = () => {
    if (!resultText) return;
    navigator.clipboard.writeText(resultText);
  };

  // Copy line-numbered code to clipboard
  const handleCopyLineNumbered = () => {
    if (!lineNumberedCode) return;
    navigator.clipboard.writeText(lineNumberedCode);
  };

  // Main "Apply" function
  const handleApply = async () => {
    setError(null);
    try {
      const originalLines = origText.split('\n');
      const selectedOps = hunks.filter((_, i) => enabled[i]);
      const patched = [...originalLines]; // we mutate in place

      for (let op of selectedOps) {
        if (op.type === 'delete') {
          await applyDelete(patched, op);
        } else if (op.type === 'replace') {
          await applyReplace(patched, op);
        } else if (op.type === 'insert') {
          await applyInsert(patched, op);
        }
      }

      setResultText(patched.join('\n'));
      setAnnotated(buildAnnotatedResult(originalLines, selectedOps));
      setStats({
        deletes: selectedOps.filter(o => o.type === 'delete').length,
        replaces: selectedOps.filter(o => o.type === 'replace').length,
        inserts: selectedOps
          .filter(o => o.type === 'insert')
          .reduce((sum, o) => sum + o.newLines.length, 0)
      });
    } catch (err) {
      setError('Failed to apply patch: ' + err.message);
    }
  };

  // --------------- Patch Functions with multi-match / distance fallback ---------------

  async function applyDelete(lines, op) {
    const { lineIndex, skip } = await findLineIndexWithConfirmation(lines, op.content, op);
    if (skip || lineIndex == null) return;
    lines.splice(lineIndex, 1);
  }

  async function applyReplace(lines, op) {
    const oldLine = op.oldLines[0];
    const { lineIndex, skip } = await findLineIndexWithConfirmation(lines, oldLine, op);
    if (skip || lineIndex == null) return;
    lines.splice(lineIndex, 1, ...op.newLines);
  }

  async function applyInsert(lines, op) {
    const { lineIndex, skip } = await findLineIndexWithConfirmation(lines, op.anchor, op);
    if (skip || lineIndex == null) return;
    lines.splice(lineIndex + 1, 0, ...op.newLines);
  }

  /**
   * findLineIndexWithConfirmation:
   *  1) find all exact fuzzy matches
   *  2) if multiple => ask user which one
   *  3) if none => find close matches (distance-based)
   *  4) ask user which close match is correct
   */
  function findLineIndexWithConfirmation(lines, target, op) {
    return new Promise(resolve => {
      const { exact, close } = findLineMatches(lines, target);

      if (exact.length === 0 && close.length === 0) {
        // No possible lines => skip
        resolve({ lineIndex: null, skip: false });
        return;
      }

      if (exact.length === 1) {
        // Exactly one direct match => done
        resolve({ lineIndex: exact[0], skip: false });
        return;
      }

      if (exact.length > 1) {
        // multiple exact => ask user
        showChoiceDialog(op, lines, exact.map(idx => ({
          idx,
          text: lines[idx],
          exact: true
        })), resolve);
        return;
      }

      // If we get here, no exact matches but we have close matches
      // We'll show them in ascending distance
      showChoiceDialog(op, lines, close.map(c => ({
        idx: c.idx,
        text: c.text,
        dist: c.dist,
        exact: false
      })), resolve);
    });
  }

  /**
   * showChoiceDialog: opens the “multiple lines matched or close matches” dialog
   *   The user picks which line to patch, or skip altogether
   */
  function showChoiceDialog(op, lines, choices, resolver) {
    setPendingOp(op);
    setPossibleChoices(choices);
    setUserChoice(String(choices[0].idx)); // default to first
    setResolveChoice(() => resolver);
  }

  function handleChoiceDialogConfirm() {
    if (!resolveChoice) return;
    const idx = parseInt(userChoice, 10);
    resolveChoice({ lineIndex: idx, skip: false });
    clearChoiceDialog();
  }

  function handleChoiceDialogSkip() {
    if (!resolveChoice) return;
    resolveChoice({ lineIndex: null, skip: true });
    clearChoiceDialog();
  }

  function clearChoiceDialog() {
    setPendingOp(null);
    setPossibleChoices([]);
    setUserChoice('');
    setResolveChoice(null);
  }

  return (
    <ThemeProvider theme={gitTheme}>
      <CssBaseline />
      <Box sx={{ display:'flex', width:'100vw', height:'100vh', bgcolor:'background.default' }}>
        {/* Left Column */}
        <Box sx={{ width:'30%', minWidth:320, borderRight:'1px solid #30363d', p:2, overflowY:'auto' }}>
          <Typography variant="h6" gutterBottom>Original Code</Typography>
          <EditorWrapper>
            <CodeMirror
              value={origText}
              extensions={[lineNumbers(), javascript({ jsx:true })]}
              onChange={val => setOrigText(val)}
            />
          </EditorWrapper>

          <Typography variant="h6" sx={{ mt:3 }} gutterBottom>Legend Script</Typography>
          <TextField
            multiline fullWidth rows={8}
            value={scriptText}
            onChange={e => setScriptText(e.target.value)}
            placeholder="D- line...   M- old / M+- new...   AF+ anchor / NAD+ new lines"
          />

          {/* Line Numbered Original Code */}
          <Card
            variant="outlined"
            sx={{ mt:2, bgcolor:'background.paper', border:'1px solid #30363d' }}
          >
            <Box sx={{ p:1, borderBottom:'1px solid #30363d' }}>
              <Typography variant="h6">Line Numbered Original Code</Typography>
            </Box>
            <Box sx={{ p:2 }}>
              <EditorWrapper>
                <CodeMirror
                  value={lineNumberedCode}
                  readOnly
                  extensions={[lineNumbers(), javascript({ jsx:true })]}
                />
              </EditorWrapper>
              <Box sx={{ display:'flex', justifyContent:'flex-end', mt:2 }}>
                <Button variant="contained" onClick={handleCopyLineNumbered}>
                  Copy
                </Button>
              </Box>
            </Box>
          </Card>
        </Box>

        {/* Right Column */}
        <Box sx={{ flex:1, p:2, overflowY:'auto' }}>
          {/* Preview Header */}
          <Box sx={{ display:'flex', alignItems:'center', mb:1 }}>
            <Typography variant="h6" sx={{ flex:1 }}>Preview</Typography>
            <Checkbox
              checked={onlyChanges}
              onChange={e => setOnlyChanges(e.target.checked)}
              color="primary"
              sx={{ mr:1 }}
            />
            <Typography>Show only changes</Typography>
            <IconButton color="primary" onClick={()=>setInfoOpen(true)} sx={{ ml:2 }}>
              <InfoIcon/>
            </IconButton>
          </Box>

          {onlyChanges ? (
            <Card
              variant="outlined"
              sx={{ mb:2, bgcolor:'background.paper', border:'1px solid #30363d' }}
            >
              <Box sx={{ p:1, borderBottom:'1px solid #30363d' }}>
                <Typography variant="h6">Changes Only</Typography>
              </Box>
              <Box sx={{ p:2 }}>
                {annotated.length === 0
                  ? <Typography>(No changes yet. Click Apply to see changes.)</Typography>
                  : <Stack spacing={0.5}>
                      {annotated.map((a,i)=>(
                        <Typography key={i} sx={{
                          fontFamily:'inherit',
                          color:a.status==='deleted'?'error.main':'success.main',
                          whiteSpace:'pre-wrap'
                        }}>
                          {(a.status==='deleted'?'- ':'+ ')+a.text}
                        </Typography>
                      ))}
                    </Stack>
                }
              </Box>
            </Card>
          ) : (
            <Card
              variant="outlined"
              sx={{ mb:2, bgcolor:'background.paper', border:'1px solid #30363d' }}
            >
              {hunks.length === 0
                ? <Box sx={{ p:2 }}><Typography>No operations to preview.</Typography></Box>
                : hunks.map((op, idx) => {
                    const lines = [];
                    if (op.type==='delete') lines.push('- '+op.content);
                    if (op.type==='replace') {
                      lines.push('- '+op.oldLines[0]);
                      op.newLines.forEach(nl=>lines.push('+ '+nl));
                    }
                    if (op.type==='insert') {
                      op.newLines.forEach(nl=>lines.push('+ '+nl));
                    }
                    return (
                      <Accordion key={idx} defaultExpanded>
                        <AccordionSummary>
                          <Checkbox
                            checked={!!enabled[idx]}
                            onChange={()=>toggleHunk(idx)}
                            sx={{ mr:1 }}
                          />
                          <Typography>{op.type.toUpperCase()} Hunk {idx+1}</Typography>
                        </AccordionSummary>
                        <AccordionDetails sx={{ bgcolor:'#161B22', borderTop:'1px solid #30363d' }}>
                          <Stack spacing={1}>
                            {lines.map((l,i)=>(
                              <Typography key={i} sx={{
                                fontFamily:'inherit',
                                color:l.startsWith('-')?'error.main':'success.main',
                                whiteSpace:'pre-wrap'
                              }}>
                                {l}
                              </Typography>
                            ))}
                          </Stack>
                        </AccordionDetails>
                      </Accordion>
                    );
                  })
              }
              <Box sx={{ display:'flex', justifyContent:'flex-end', p:2 }}>
                <Button variant="contained" onClick={handleApply}>Apply</Button>
              </Box>
            </Card>
          )}

          {/* Result Card */}
          <Card
            variant="outlined"
            sx={{ bgcolor:'background.paper', border:'1px solid #30363d', mb:2 }}
          >
            <Box sx={{ p:1, borderBottom:'1px solid #30363d' }}>
              <Typography variant="h6">Result (Final Code)</Typography>
            </Box>
            <Box sx={{ p:2 }}>
              <EditorWrapper>
                <CodeMirror
                  value={resultText}
                  readOnly
                  extensions={[lineNumbers(), javascript({ jsx:true })]}
                />
              </EditorWrapper>
              {stats && (
                <Box sx={{ mt:2 }}>
                  <Typography>Deleted: {stats.deletes}</Typography>
                  <Typography>Replaced: {stats.replaces}</Typography>
                  <Typography>Inserted: {stats.inserts}</Typography>
                </Box>
              )}
              {error && (
                <Typography color="error" sx={{ mt:1 }}>
                  {error}
                </Typography>
              )}
              <Box sx={{ display:'flex', justifyContent:'flex-end', mt:2 }}>
                <Button variant="contained" onClick={handleCopyResult}>
                  Copy
                </Button>
              </Box>
            </Box>
          </Card>

          {/* Annotated Diff */}
          {annotated.length>0 && (
            <Card
              variant="outlined"
              sx={{ bgcolor:'background.paper', border:'1px solid #30363d' }}
            >
              <Box sx={{ p:1, borderBottom:'1px solid #30363d' }}>
                <Typography variant="h6">Annotated Diff</Typography>
              </Box>
              <Box sx={{ p:2 }}>
                <Stack spacing={0.5}>
                  {annotated.map((a,i)=>(
                    <Typography
                      key={i}
                      sx={{
                        fontFamily:'inherit',
                        color:a.status==='deleted'?'error.main':'success.main',
                        whiteSpace:'pre-wrap'
                      }}
                    >
                      {(a.status==='deleted'?'- ':'+ ')+a.text}
                    </Typography>
                  ))}
                </Stack>
              </Box>
            </Card>
          )}
        </Box>
      </Box>

      {/* Info Dialog */}
      <Dialog open={infoOpen} onClose={()=>setInfoOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Legend Script Info</DialogTitle>
        <DialogContent dividers>
          <Typography>
            D- &lt;line&gt; → delete<br />
            M- &lt;oldLine&gt; / M+- &lt;newLine&gt; → replace<br />
            AF+ &lt;anchor&gt; / NAD+ &lt;newLine&gt; → insert<br />
            <br />
            This patcher ignores case, indentation, whitespace, and zero-width chars.
            It can also guess “close” lines if it finds no exact match. If multiple lines
            match or are close, you’ll be prompted to pick the correct line.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>setInfoOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Multi-Match or Close-Match Dialog */}
      <Dialog open={!!pendingOp} maxWidth="md" fullWidth>
        {pendingOp && (
          <>
            <DialogTitle>
              {pendingOp.type.toUpperCase()} operation
            </DialogTitle>
            <DialogContent dividers>
              <Typography variant="body2" sx={{ mb: 2 }}>
                Multiple lines found or close matches for:
              </Typography>
              <Typography variant="body2" sx={{ fontWeight:'bold', mb:2 }}>
                {pendingOp.type === 'delete'
                  ? pendingOp.content
                  : pendingOp.type === 'replace'
                  ? pendingOp.oldLines[0]
                  : pendingOp.anchor
                }
              </Typography>
              <Typography variant="body2" sx={{ mb:1 }}>
                Pick the line you want to patch or skip entirely:
              </Typography>

              <RadioGroup
                value={userChoice}
                onChange={e => setUserChoice(e.target.value)}
              >
                {possibleChoices.map(({ idx, text, dist, exact }) => {
                  const lineLabel = `Line ${idx+1}: ${text}`;
                  return (
                    <FormControlLabel
                      key={idx}
                      value={String(idx)}
                      control={<Radio />}
                      label={exact
                        ? lineLabel + ' (exact match)'
                        : dist!==undefined
                          ? lineLabel + ` (distance=${dist})`
                          : lineLabel
                      }
                    />
                  );
                })}
              </RadioGroup>
            </DialogContent>
            <DialogActions>
              <Button onClick={handleChoiceDialogSkip} color="inherit">
                Skip
              </Button>
              <Button onClick={handleChoiceDialogConfirm} variant="contained">
                Confirm
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </ThemeProvider>
  );
}
