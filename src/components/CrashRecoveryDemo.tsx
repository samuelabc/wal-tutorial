import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Row {
  id: number;
  name: string;
  balance: number;
}

const INITIAL_DATA: Row[] = [
  { id: 1, name: 'Alice', balance: 1000 },
  { id: 2, name: 'Bob', balance: 500 },
];

const OPERATIONS = [
  'BEGIN TRANSACTION',
  'UPDATE Alice SET balance = 800  (was 1000)',
  'UPDATE Bob SET balance = 700    (was 500)',
  'COMMIT',
];

type Phase = 'ready' | 'running' | 'crashed' | 'recovering' | 'recovered';

export default function CrashRecoveryDemo() {
  const [phase, setPhase] = useState<Phase>('ready');
  const [opIndex, setOpIndex] = useState(0);
  const [crashAt, setCrashAt] = useState(2);
  const [noWalData, setNoWalData] = useState<Row[]>(INITIAL_DATA);
  const [walData, setWalData] = useState<Row[]>(INITIAL_DATA);
  const [walLog, setWalLog] = useState<string[]>([]);

  const reset = () => {
    setPhase('ready');
    setOpIndex(0);
    setNoWalData(INITIAL_DATA);
    setWalData(INITIAL_DATA);
    setWalLog([]);
  };

  const runSimulation = async () => {
    setPhase('running');
    const d = (ms: number) => new Promise(r => setTimeout(r, ms));

    for (let i = 0; i < OPERATIONS.length; i++) {
      setOpIndex(i);
      await d(800);

      if (i === crashAt) {
        // Crash!
        setPhase('crashed');

        // Without WAL: partial state stuck in data file
        if (crashAt >= 1) {
          setNoWalData([
            { id: 1, name: 'Alice', balance: 800 },
            { id: 2, name: 'Bob', balance: 500 },
          ]);
        }

        // With WAL: data file still has original
        // WAL has records up to crash point but no COMMIT
        const walEntries = OPERATIONS.slice(0, i + 1).map(op => `[WAL] ${op}`);
        setWalLog(walEntries);
        setWalData(INITIAL_DATA); // data file unchanged — WAL not checkpointed

        await d(1500);
        setPhase('recovering');
        await d(1500);

        // Recovery with WAL: no COMMIT found → undo all changes
        setWalLog(prev => [...prev, '[RECOVERY] No COMMIT record found', '[RECOVERY] Rolling back — discard WAL entries']);
        setWalData(INITIAL_DATA);
        await d(1000);

        setPhase('recovered');
        return;
      }

      // Normal progress
      if (i === 1) {
        setWalLog(prev => [...prev, `[WAL] LSN=1: UPDATE Alice 1000→800`]);
      }
      if (i === 2) {
        setWalLog(prev => [...prev, `[WAL] LSN=2: UPDATE Bob 500→700`]);
      }
      if (i === 3) {
        setWalLog(prev => [...prev, `[WAL] LSN=3: COMMIT`]);
        setWalData([
          { id: 1, name: 'Alice', balance: 800 },
          { id: 2, name: 'Bob', balance: 700 },
        ]);
      }
    }
    setPhase('recovered');
  };

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
    marginTop: '8px',
  };

  const cellStyle = (highlight = false): React.CSSProperties => ({
    padding: '6px 10px',
    border: '1px solid #374151',
    background: highlight ? 'rgba(239,68,68,0.15)' : 'transparent',
    color: highlight ? '#fca5a5' : 'inherit',
  });

  const headStyle: React.CSSProperties = {
    padding: '6px 10px',
    border: '1px solid #374151',
    background: 'rgba(99,102,241,0.1)',
    fontWeight: 600,
    textAlign: 'left',
  };

  const panelStyle: React.CSSProperties = {
    flex: 1,
    minWidth: '240px',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #374151',
    background: 'rgba(30,30,40,0.5)',
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={runSimulation}
          disabled={phase !== 'ready'}
          style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', opacity: phase !== 'ready' ? 0.5 : 1 }}
        >
          ▶ Run (crashes at op {crashAt + 1})
        </button>
        <button onClick={reset} style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid #374151', background: 'transparent', color: '#9ca3af', cursor: 'pointer' }}>
          ↺ Reset
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#9ca3af' }}>
          Crash after operation:
          <select
            value={crashAt}
            onChange={e => { setCrashAt(Number(e.target.value)); reset(); }}
            style={{ background: '#1f2937', color: '#e5e7eb', border: '1px solid #374151', borderRadius: '4px', padding: '2px 6px' }}
          >
            <option value={1}>1 (after first UPDATE)</option>
            <option value={2}>2 (after second UPDATE)</option>
          </select>
        </label>
      </div>

      {/* Operation log */}
      <div style={{ marginBottom: '12px', padding: '10px', background: 'rgba(30,30,40,0.7)', borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace' }}>
        {OPERATIONS.map((op, i) => (
          <div key={i} style={{
            padding: '3px 0',
            color: i === opIndex && phase === 'running' ? '#6366f1'
              : i === crashAt && (phase === 'crashed' || phase === 'recovering' || phase === 'recovered') ? '#ef4444'
                : i < opIndex || phase === 'recovered' ? '#22c55e' : '#6b7280',
            fontWeight: i === opIndex && phase === 'running' ? 700 : 400,
          }}>
            {i === crashAt && phase !== 'ready' && phase !== 'running' ? '⚡ ' : ''}{op}
          </div>
        ))}
      </div>

      {/* Side by side comparison */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {/* Without WAL */}
        <div style={panelStyle}>
          <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: '#ef4444' }}>❌ Without WAL</h4>
          <table style={tableStyle}>
            <thead>
              <tr><th style={headStyle}>Name</th><th style={headStyle}>Balance</th></tr>
            </thead>
            <tbody>
              {noWalData.map(row => (
                <tr key={row.id}>
                  <td style={cellStyle()}>{row.name}</td>
                  <td style={cellStyle(row.balance !== INITIAL_DATA.find(r => r.id === row.id)!.balance)}>
                    ${row.balance}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <AnimatePresence>
            {(phase === 'crashed' || phase === 'recovering' || phase === 'recovered') && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{ marginTop: '8px', fontSize: '12px', color: '#fca5a5', lineHeight: 1.4 }}
              >
                Inconsistent state! Alice debited but Bob never credited. $200 vanished.
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* With WAL */}
        <div style={panelStyle}>
          <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: '#22c55e' }}>✅ With WAL</h4>
          <table style={tableStyle}>
            <thead>
              <tr><th style={headStyle}>Name</th><th style={headStyle}>Balance</th></tr>
            </thead>
            <tbody>
              {walData.map(row => (
                <tr key={row.id}>
                  <td style={cellStyle()}>{row.name}</td>
                  <td style={cellStyle()}>${row.balance}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {walLog.length > 0 && (
            <div style={{ marginTop: '8px', fontSize: '11px', fontFamily: 'monospace', color: '#9ca3af', lineHeight: 1.5 }}>
              {walLog.map((entry, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  style={{ color: entry.includes('RECOVERY') ? '#fbbf24' : entry.includes('COMMIT') ? '#22c55e' : '#9ca3af' }}
                >
                  {entry}
                </motion.div>
              ))}
            </div>
          )}
          <AnimatePresence>
            {phase === 'recovered' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{ marginTop: '8px', fontSize: '12px', color: '#86efac', lineHeight: 1.4 }}
              >
                Consistent! No COMMIT in WAL → all changes rolled back. Original balances preserved.
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
