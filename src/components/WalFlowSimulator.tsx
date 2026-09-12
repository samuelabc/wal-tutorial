import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type Stage = 'idle' | 'writing-wal' | 'fsyncing' | 'ack' | 'flushing-data' | 'done' | 'crashed';

interface LogEntry {
  id: number;
  label: string;
  status: 'pending' | 'in-wal' | 'synced' | 'flushed';
}

const STAGE_LABELS: Record<Stage, string> = {
  idle: 'Waiting for write...',
  'writing-wal': '1. Appending to WAL buffer',
  fsyncing: '2. fsync() — flushing WAL to disk',
  ack: '3. COMMIT acknowledged to client',
  'flushing-data': '4. (Async) Flushing dirty pages to data file',
  done: 'Transaction complete!',
  crashed: 'CRASH! Power lost.',
};

const STAGE_ORDER: Stage[] = ['idle', 'writing-wal', 'fsyncing', 'ack', 'flushing-data', 'done'];

export default function WalFlowSimulator() {
  const [stage, setStage] = useState<Stage>('idle');
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [crashPoint, setCrashPoint] = useState<Stage | null>(null);
  const [entries, setEntries] = useState<LogEntry[]>([
    { id: 1, label: 'UPDATE accounts SET balance=500 WHERE id=1', status: 'pending' },
  ]);
  const [recoveryMessage, setRecoveryMessage] = useState('');

  const delay = useCallback((ms: number) => new Promise(r => setTimeout(r, ms / speed)), [speed]);

  const reset = () => {
    setStage('idle');
    setIsPlaying(false);
    setCrashPoint(null);
    setRecoveryMessage('');
    setEntries([{ id: 1, label: 'UPDATE accounts SET balance=500 WHERE id=1', status: 'pending' }]);
  };

  const crash = () => {
    setCrashPoint(stage);
    setStage('crashed');
    setIsPlaying(false);
    if (stage === 'idle' || stage === 'writing-wal') {
      setRecoveryMessage('Recovery: WAL record was NOT durable. Transaction is lost — but database is consistent (old data preserved).');
    } else if (stage === 'fsyncing') {
      setRecoveryMessage('Recovery: WAL write may be partial. Recovery will detect incomplete record via CRC check and discard it. No corruption.');
    } else if (stage === 'ack' || stage === 'flushing-data') {
      setRecoveryMessage('Recovery: WAL record IS durable. Recovery replays the WAL → data is restored. Zero data loss!');
    }
  };

  useEffect(() => {
    if (!isPlaying || stage === 'crashed') return;
    let cancelled = false;

    const run = async () => {
      const idx = STAGE_ORDER.indexOf(stage);
      if (idx < 0 || idx >= STAGE_ORDER.length - 1) {
        setIsPlaying(false);
        return;
      }

      await delay(1200);
      if (cancelled) return;

      const next = STAGE_ORDER[idx + 1];
      setStage(next);

      if (next === 'writing-wal') {
        setEntries(e => e.map(x => ({ ...x, status: 'in-wal' })));
      } else if (next === 'fsyncing' || next === 'ack') {
        setEntries(e => e.map(x => ({ ...x, status: 'synced' })));
      } else if (next === 'flushing-data' || next === 'done') {
        setEntries(e => e.map(x => ({ ...x, status: 'flushed' })));
      }
    };

    run();
    return () => { cancelled = true; };
  }, [isPlaying, stage, delay]);

  const step = () => {
    if (stage === 'crashed') return;
    const idx = STAGE_ORDER.indexOf(stage);
    if (idx >= 0 && idx < STAGE_ORDER.length - 1) {
      const next = STAGE_ORDER[idx + 1];
      setStage(next);
      if (next === 'writing-wal') {
        setEntries(e => e.map(x => ({ ...x, status: 'in-wal' })));
      } else if (next === 'fsyncing' || next === 'ack') {
        setEntries(e => e.map(x => ({ ...x, status: 'synced' })));
      } else if (next === 'flushing-data' || next === 'done') {
        setEntries(e => e.map(x => ({ ...x, status: 'flushed' })));
      }
    }
  };

  const boxStyle = (active: boolean, danger = false): React.CSSProperties => ({
    padding: '12px 16px',
    borderRadius: '8px',
    border: `2px solid ${active ? (danger ? '#ef4444' : '#6366f1') : '#374151'}`,
    background: active ? (danger ? 'rgba(239,68,68,0.1)' : 'rgba(99,102,241,0.1)') : 'rgba(55,65,81,0.3)',
    textAlign: 'center',
    fontSize: '13px',
    fontWeight: active ? 600 : 400,
    color: active ? '#fff' : '#9ca3af',
    transition: 'all 0.3s ease',
    minHeight: '60px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
  });

  const arrowStyle: React.CSSProperties = {
    textAlign: 'center',
    color: '#6366f1',
    fontSize: '20px',
    padding: '4px 0',
  };

  const isDanger = stage === 'crashed';

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={() => { if (stage === 'idle') setStage('idle'); setIsPlaying(true); if (stage === 'idle') { setStage('writing-wal'); setEntries(e => e.map(x => ({ ...x, status: 'in-wal' }))); } }}
          disabled={isPlaying || stage === 'done' || stage === 'crashed'}
          style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', opacity: isPlaying || stage === 'done' || stage === 'crashed' ? 0.5 : 1 }}
        >
          ▶ Play
        </button>
        <button
          onClick={step}
          disabled={isPlaying || stage === 'done' || stage === 'crashed'}
          style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid #6366f1', background: 'transparent', color: '#6366f1', cursor: 'pointer', opacity: isPlaying || stage === 'done' || stage === 'crashed' ? 0.5 : 1 }}
        >
          Step →
        </button>
        <button
          onClick={crash}
          disabled={stage === 'idle' || stage === 'done' || stage === 'crashed'}
          style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', cursor: 'pointer', opacity: stage === 'idle' || stage === 'done' || stage === 'crashed' ? 0.5 : 1 }}
        >
          ⚡ Crash!
        </button>
        <button
          onClick={reset}
          style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid #374151', background: 'transparent', color: '#9ca3af', cursor: 'pointer' }}
        >
          ↺ Reset
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', fontSize: '12px', color: '#9ca3af' }}>
          Speed:
          <input type="range" min="0.5" max="3" step="0.5" value={speed} onChange={e => setSpeed(parseFloat(e.target.value))} style={{ width: '80px' }} />
          {speed}x
        </label>
      </div>

      {/* Status */}
      <div style={{
        padding: '10px 16px',
        borderRadius: '8px',
        background: isDanger ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.1)',
        marginBottom: '16px',
        fontSize: '14px',
        fontWeight: 600,
        color: isDanger ? '#ef4444' : '#6366f1',
      }}>
        {STAGE_LABELS[stage]}
      </div>

      {/* Flow visualization */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0' }}>
        <div style={boxStyle(stage === 'idle' || stage === 'writing-wal')}>
          <div>📝 Client</div>
          <div style={{ fontSize: '11px', opacity: 0.7 }}>{entries[0].label}</div>
        </div>
        <div style={arrowStyle}>↓</div>
        <motion.div
          style={boxStyle(stage === 'writing-wal' || stage === 'fsyncing')}
          animate={stage === 'writing-wal' ? { scale: [1, 1.02, 1] } : {}}
          transition={{ repeat: Infinity, duration: 0.8 }}
        >
          <div>📋 WAL Buffer (memory)</div>
          {(stage !== 'idle') && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ fontSize: '11px', color: '#a5b4fc', marginTop: '4px' }}
            >
              Record: LSN=1, UPDATE balance=500
            </motion.div>
          )}
        </motion.div>
        <div style={arrowStyle}>↓ fsync()</div>
        <motion.div
          style={boxStyle(stage === 'fsyncing' || stage === 'ack', false)}
          animate={stage === 'fsyncing' ? { boxShadow: ['0 0 0px #6366f1', '0 0 15px #6366f1', '0 0 0px #6366f1'] } : {}}
          transition={{ repeat: Infinity, duration: 0.6 }}
        >
          <div>💾 WAL File (on disk)</div>
          {(['fsyncing', 'ack', 'flushing-data', 'done', 'crashed'].includes(stage) && crashPoint !== 'writing-wal') && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ fontSize: '11px', color: '#22c55e', marginTop: '4px' }}
            >
              ✓ Durable! Survives crash.
            </motion.div>
          )}
        </motion.div>
        <div style={arrowStyle}>↓ COMMIT OK → client</div>
        <div style={boxStyle(stage === 'ack')}>
          <div>✅ Client ACK</div>
          {['ack', 'flushing-data', 'done'].includes(stage) && (
            <div style={{ fontSize: '11px', color: '#22c55e' }}>Transaction committed</div>
          )}
        </div>
        <div style={arrowStyle}>↓ async (lazy)</div>
        <motion.div
          style={boxStyle(stage === 'flushing-data' || stage === 'done')}
          animate={stage === 'flushing-data' ? { opacity: [1, 0.6, 1] } : {}}
          transition={{ repeat: Infinity, duration: 1 }}
        >
          <div>🗃️ Data File (on disk)</div>
          {stage === 'done' && (
            <div style={{ fontSize: '11px', color: '#22c55e' }}>Page updated</div>
          )}
        </motion.div>
      </div>

      {/* Recovery message on crash */}
      <AnimatePresence>
        {stage === 'crashed' && recoveryMessage && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              marginTop: '16px',
              padding: '12px 16px',
              borderRadius: '8px',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid #ef4444',
              fontSize: '13px',
              color: '#fca5a5',
              lineHeight: 1.5,
            }}
          >
            {recoveryMessage}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
