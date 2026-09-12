import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface LogRecord {
  lsn: number;
  txn: string;
  type: 'update' | 'commit' | 'abort' | 'clr' | 'checkpoint' | 'end';
  page?: number;
  desc: string;
  undoNext?: number;
}

interface TxnEntry {
  txn: string;
  state: 'running' | 'committed' | 'aborted';
  lastLsn: number;
  undoNext: number;
}

interface DptEntry {
  page: number;
  recLsn: number;
}

const LOG: LogRecord[] = [
  { lsn: 1, txn: 'T1', type: 'update', page: 5, desc: 'T1: Write Page 5 (balance=1000→800)' },
  { lsn: 2, txn: 'T2', type: 'update', page: 3, desc: 'T2: Write Page 3 (name=Alice→Bob)' },
  { lsn: 3, txn: 'T1', type: 'update', page: 8, desc: 'T1: Write Page 8 (qty=10→7)' },
  { lsn: 4, txn: '-', type: 'checkpoint', desc: 'BEGIN CHECKPOINT (ATT: T1,T2 active; DPT: P5@1, P3@2, P8@3)' },
  { lsn: 5, txn: 'T2', type: 'update', page: 3, desc: 'T2: Write Page 3 (name=Bob→Charlie)' },
  { lsn: 6, txn: 'T3', type: 'update', page: 5, desc: 'T3: Write Page 5 (balance=800→600)' },
  { lsn: 7, txn: 'T2', type: 'commit', desc: 'T2: COMMIT' },
  { lsn: 8, txn: 'T1', type: 'update', page: 10, desc: 'T1: Write Page 10 (status=active→closed)' },
  { lsn: 9, txn: 'T3', type: 'update', page: 12, desc: 'T3: Write Page 12 (total=0→500)' },
  // CRASH happens here
];

type Phase = 'idle' | 'analysis' | 'redo' | 'undo' | 'done';

export default function AriesRecoverySimulator() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [currentLsn, setCurrentLsn] = useState(-1);
  const [att, setAtt] = useState<TxnEntry[]>([]);
  const [dpt, setDpt] = useState<DptEntry[]>([]);
  const [redoLsn, setRedoLsn] = useState(0);
  const [log, setLog] = useState<LogRecord[]>(LOG);
  const [messages, setMessages] = useState<string[]>([]);
  const [stepIndex, setStepIndex] = useState(0);

  const reset = () => {
    setPhase('idle');
    setCurrentLsn(-1);
    setAtt([]);
    setDpt([]);
    setRedoLsn(0);
    setLog(LOG);
    setMessages([]);
    setStepIndex(0);
  };

  const analysisSteps = () => {
    const steps: Array<() => void> = [];

    // Start from checkpoint (LSN 4)
    steps.push(() => {
      setPhase('analysis');
      setCurrentLsn(4);
      setAtt([
        { txn: 'T1', state: 'running', lastLsn: 3, undoNext: 3 },
        { txn: 'T2', state: 'running', lastLsn: 2, undoNext: 2 },
      ]);
      setDpt([
        { page: 5, recLsn: 1 },
        { page: 3, recLsn: 2 },
        { page: 8, recLsn: 3 },
      ]);
      setRedoLsn(1);
      setMessages(['Analysis: Start from checkpoint at LSN 4', 'Loaded ATT: T1(active), T2(active)', 'Loaded DPT: P5@1, P3@2, P8@3', 'RedoLSN = min(RecLSN) = 1']);
    });

    // LSN 5: T2 writes P3
    steps.push(() => {
      setCurrentLsn(5);
      setAtt(prev => prev.map(t => t.txn === 'T2' ? { ...t, lastLsn: 5, undoNext: 5 } : t));
      // P3 already in DPT
      setMessages(prev => [...prev, 'LSN 5: T2 updates P3 → ATT[T2].lastLSN=5 (P3 already in DPT)']);
    });

    // LSN 6: T3 writes P5
    steps.push(() => {
      setCurrentLsn(6);
      setAtt(prev => [...prev, { txn: 'T3', state: 'running', lastLsn: 6, undoNext: 6 }]);
      // P5 already in DPT
      setMessages(prev => [...prev, 'LSN 6: T3 updates P5 → Add T3 to ATT (new txn), P5 already in DPT']);
    });

    // LSN 7: T2 commits
    steps.push(() => {
      setCurrentLsn(7);
      setAtt(prev => prev.filter(t => t.txn !== 'T2'));
      setMessages(prev => [...prev, 'LSN 7: T2 COMMIT → Remove T2 from ATT (winner transaction)']);
    });

    // LSN 8: T1 writes P10
    steps.push(() => {
      setCurrentLsn(8);
      setAtt(prev => prev.map(t => t.txn === 'T1' ? { ...t, lastLsn: 8, undoNext: 8 } : t));
      setDpt(prev => [...prev, { page: 10, recLsn: 8 }]);
      setMessages(prev => [...prev, 'LSN 8: T1 updates P10 → ATT[T1].lastLSN=8, Add P10@8 to DPT']);
    });

    // LSN 9: T3 writes P12
    steps.push(() => {
      setCurrentLsn(9);
      setAtt(prev => prev.map(t => t.txn === 'T3' ? { ...t, lastLsn: 9, undoNext: 9 } : t));
      setDpt(prev => [...prev, { page: 12, recLsn: 9 }]);
      setMessages(prev => [...prev, 'LSN 9: T3 updates P12 → ATT[T3].lastLSN=9, Add P12@9 to DPT']);
    });

    // End analysis
    steps.push(() => {
      setMessages(prev => [...prev,
        '─── Analysis Complete ───',
        'Losers (active at crash): T1, T3',
        'Winner: T2 (committed)',
        `RedoLSN = ${1} (start redo from here)`,
      ]);
    });

    return steps;
  };

  const redoSteps = () => {
    const steps: Array<() => void> = [];
    const redoRecords = LOG.filter(r => r.type === 'update');

    steps.push(() => {
      setPhase('redo');
      setMessages(prev => [...prev, '', '═══ REDO PHASE ═══', `Scanning forward from RedoLSN=${1}`]);
    });

    for (const rec of redoRecords) {
      steps.push(() => {
        setCurrentLsn(rec.lsn);
        const inDpt = true; // simplified
        setMessages(prev => [...prev,
          `LSN ${rec.lsn}: ${rec.desc} → ${inDpt ? 'REDO (apply change)' : 'SKIP (page already up to date)'}`
        ]);
      });
    }

    steps.push(() => {
      setMessages(prev => [...prev,
        '─── Redo Complete ───',
        'Database now reflects exact crash-time state',
        'ALL transactions replayed (including losers T1, T3)',
      ]);
    });

    return steps;
  };

  const undoSteps = () => {
    const steps: Array<() => void> = [];

    steps.push(() => {
      setPhase('undo');
      setMessages(prev => [...prev, '', '═══ UNDO PHASE ═══', 'Rolling back losers: T1 (undoNext=8), T3 (undoNext=9)', 'Process in reverse LSN order (highest first)']);
    });

    // Undo T3 LSN 9
    steps.push(() => {
      setCurrentLsn(9);
      const clr1: LogRecord = { lsn: 10, txn: 'T3', type: 'clr', page: 12, desc: 'CLR: Undo T3 P12 (total=500→0)', undoNext: 6 };
      setLog(prev => [...prev, clr1]);
      setAtt(prev => prev.map(t => t.txn === 'T3' ? { ...t, undoNext: 6 } : t));
      setMessages(prev => [...prev, 'Undo LSN 9 (T3, P12) → Write CLR at LSN 10 (undoNext=6)']);
    });

    // Undo T1 LSN 8
    steps.push(() => {
      setCurrentLsn(8);
      const clr2: LogRecord = { lsn: 11, txn: 'T1', type: 'clr', page: 10, desc: 'CLR: Undo T1 P10 (status=closed→active)', undoNext: 3 };
      setLog(prev => [...prev, clr2]);
      setAtt(prev => prev.map(t => t.txn === 'T1' ? { ...t, undoNext: 3 } : t));
      setMessages(prev => [...prev, 'Undo LSN 8 (T1, P10) → Write CLR at LSN 11 (undoNext=3)']);
    });

    // Undo T3 LSN 6
    steps.push(() => {
      setCurrentLsn(6);
      const clr3: LogRecord = { lsn: 12, txn: 'T3', type: 'clr', page: 5, desc: 'CLR: Undo T3 P5 (balance=600→800)', undoNext: 0 };
      setLog(prev => [...prev, clr3]);
      setAtt(prev => prev.filter(t => t.txn !== 'T3'));
      setLog(prev => [...prev, { lsn: 13, txn: 'T3', type: 'end', desc: 'T3: END (fully rolled back)' }]);
      setMessages(prev => [...prev, 'Undo LSN 6 (T3, P5) → CLR at LSN 12 (undoNext=0). T3 fully undone.']);
    });

    // Undo T1 LSN 3
    steps.push(() => {
      setCurrentLsn(3);
      const clr4: LogRecord = { lsn: 14, txn: 'T1', type: 'clr', page: 8, desc: 'CLR: Undo T1 P8 (qty=7→10)', undoNext: 1 };
      setLog(prev => [...prev, clr4]);
      setAtt(prev => prev.map(t => t.txn === 'T1' ? { ...t, undoNext: 1 } : t));
      setMessages(prev => [...prev, 'Undo LSN 3 (T1, P8) → CLR at LSN 14 (undoNext=1)']);
    });

    // Undo T1 LSN 1
    steps.push(() => {
      setCurrentLsn(1);
      const clr5: LogRecord = { lsn: 15, txn: 'T1', type: 'clr', page: 5, desc: 'CLR: Undo T1 P5 (balance=800→1000)', undoNext: 0 };
      setLog(prev => [...prev, clr5]);
      setAtt(prev => prev.filter(t => t.txn !== 'T1'));
      setLog(prev => [...prev, { lsn: 16, txn: 'T1', type: 'end', desc: 'T1: END (fully rolled back)' }]);
      setMessages(prev => [...prev, 'Undo LSN 1 (T1, P5) → CLR at LSN 15 (undoNext=0). T1 fully undone.']);
    });

    steps.push(() => {
      setPhase('done');
      setMessages(prev => [...prev,
        '',
        '═══ RECOVERY COMPLETE ═══',
        'T2: Committed changes preserved (winner)',
        'T1: All changes rolled back via CLRs (loser)',
        'T3: All changes rolled back via CLRs (loser)',
        'Database is now consistent!',
      ]);
    });

    return steps;
  };

  const allSteps = [...analysisSteps(), ...redoSteps(), ...undoSteps()];

  const stepForward = () => {
    if (stepIndex < allSteps.length) {
      allSteps[stepIndex]();
      setStepIndex(prev => prev + 1);
    }
  };

  const runAll = async () => {
    reset();
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
    const steps = [...analysisSteps(), ...redoSteps(), ...undoSteps()];
    for (let i = 0; i < steps.length; i++) {
      steps[i]();
      await delay(600);
    }
  };

  const typeColor = (type: string) => {
    switch (type) {
      case 'update': return '#60a5fa';
      case 'commit': return '#22c55e';
      case 'abort': return '#ef4444';
      case 'clr': return '#f59e0b';
      case 'checkpoint': return '#c084fc';
      case 'end': return '#6b7280';
      default: return '#9ca3af';
    }
  };

  const phaseColor = phase === 'analysis' ? '#60a5fa' : phase === 'redo' ? '#22c55e' : phase === 'undo' ? '#f59e0b' : '#6366f1';

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={stepForward} disabled={stepIndex >= allSteps.length}
          style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', background: phaseColor, color: '#fff', cursor: 'pointer', opacity: stepIndex >= allSteps.length ? 0.5 : 1 }}>
          Step → ({stepIndex}/{allSteps.length})
        </button>
        <button onClick={runAll}
          style={{ padding: '6px 16px', borderRadius: '6px', border: `1px solid ${phaseColor}`, background: 'transparent', color: phaseColor, cursor: 'pointer' }}>
          ▶ Auto-run
        </button>
        <button onClick={reset}
          style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid #374151', background: 'transparent', color: '#9ca3af', cursor: 'pointer' }}>
          ↺ Reset
        </button>
        {phase !== 'idle' && (
          <span style={{ fontSize: '13px', fontWeight: 700, color: phaseColor, textTransform: 'uppercase' }}>
            Phase: {phase}
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {/* Log */}
        <div>
          <h4 style={{ margin: '0 0 6px', fontSize: '12px', color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>WAL Log</h4>
          <div style={{ maxHeight: '280px', overflowY: 'auto', fontSize: '11px', fontFamily: 'monospace', background: 'rgba(30,30,40,0.5)', borderRadius: '6px', padding: '6px' }}>
            {log.map((r, i) => (
              <motion.div
                key={`${r.lsn}-${i}`}
                initial={r.lsn > 9 ? { opacity: 0, x: -8 } : {}}
                animate={{ opacity: 1, x: 0 }}
                style={{
                  padding: '2px 6px',
                  marginBottom: '1px',
                  borderRadius: '3px',
                  background: r.lsn === currentLsn ? 'rgba(99,102,241,0.2)' : 'transparent',
                  borderLeft: `3px solid ${typeColor(r.type)}`,
                  color: r.lsn === currentLsn ? '#fff' : '#d1d5db',
                }}
              >
                <span style={{ color: '#6b7280' }}>[{r.lsn}]</span> {r.desc}
              </motion.div>
            ))}
            {phase === 'idle' && (
              <div style={{ padding: '4px 6px', color: '#ef4444', fontWeight: 700, borderLeft: '3px solid #ef4444' }}>
                ⚡ CRASH ⚡
              </div>
            )}
          </div>
        </div>

        {/* Tables */}
        <div>
          {/* ATT */}
          <h4 style={{ margin: '0 0 6px', fontSize: '12px', color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Transaction Table (ATT)
          </h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginBottom: '12px' }}>
            <thead>
              <tr>
                <th style={{ padding: '4px 6px', borderBottom: '1px solid #374151', textAlign: 'left', color: '#9ca3af' }}>Txn</th>
                <th style={{ padding: '4px 6px', borderBottom: '1px solid #374151', textAlign: 'left', color: '#9ca3af' }}>State</th>
                <th style={{ padding: '4px 6px', borderBottom: '1px solid #374151', textAlign: 'left', color: '#9ca3af' }}>LastLSN</th>
                <th style={{ padding: '4px 6px', borderBottom: '1px solid #374151', textAlign: 'left', color: '#9ca3af' }}>UndoNext</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {att.map(t => (
                  <motion.tr key={t.txn} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <td style={{ padding: '3px 6px', fontWeight: 700, color: '#e5e7eb' }}>{t.txn}</td>
                    <td style={{ padding: '3px 6px', color: t.state === 'running' ? '#fbbf24' : '#22c55e' }}>{t.state}</td>
                    <td style={{ padding: '3px 6px', color: '#e5e7eb' }}>{t.lastLsn}</td>
                    <td style={{ padding: '3px 6px', color: '#e5e7eb' }}>{t.undoNext}</td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {att.length === 0 && phase !== 'idle' && (
                <tr><td colSpan={4} style={{ padding: '6px', color: '#22c55e', fontSize: '10px' }}>Empty — all transactions resolved</td></tr>
              )}
            </tbody>
          </table>

          {/* DPT */}
          <h4 style={{ margin: '0 0 6px', fontSize: '12px', color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Dirty Page Table (DPT)
          </h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr>
                <th style={{ padding: '4px 6px', borderBottom: '1px solid #374151', textAlign: 'left', color: '#9ca3af' }}>Page</th>
                <th style={{ padding: '4px 6px', borderBottom: '1px solid #374151', textAlign: 'left', color: '#9ca3af' }}>RecLSN</th>
              </tr>
            </thead>
            <tbody>
              {dpt.map(d => (
                <tr key={d.page}>
                  <td style={{ padding: '3px 6px', color: '#e5e7eb' }}>P{d.page}</td>
                  <td style={{ padding: '3px 6px', color: '#e5e7eb' }}>{d.recLsn}</td>
                </tr>
              ))}
              {dpt.length === 0 && <tr><td colSpan={2} style={{ padding: '6px', color: '#6b7280', fontSize: '10px' }}>Empty</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Message log */}
      <div style={{ marginTop: '12px', maxHeight: '200px', overflowY: 'auto', fontSize: '11px', fontFamily: 'monospace', background: 'rgba(30,30,40,0.5)', borderRadius: '6px', padding: '8px', lineHeight: 1.6 }}>
        {messages.length === 0 && (
          <div style={{ color: '#6b7280' }}>Click "Step" to begin ARIES three-pass recovery...</div>
        )}
        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              color: msg.includes('═══') ? phaseColor
                : msg.includes('───') ? '#6b7280'
                  : msg.includes('CLR') ? '#f59e0b'
                    : msg.includes('REDO') ? '#22c55e'
                      : msg.includes('COMPLETE') ? '#22c55e'
                        : '#d1d5db',
              fontWeight: msg.includes('═══') || msg.includes('COMPLETE') ? 700 : 400,
            }}
          >
            {msg}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
