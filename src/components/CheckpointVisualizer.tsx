import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Page {
  id: number;
  dirty: boolean;
  flushing: boolean;
  lsn: number;
  hasFpi: boolean;
}

interface WalEntry {
  lsn: number;
  label: string;
  checkpointed: boolean;
}

export default function CheckpointVisualizer() {
  const [pages, setPages] = useState<Page[]>([
    { id: 1, dirty: true, flushing: false, lsn: 5, hasFpi: true },
    { id: 2, dirty: false, flushing: false, lsn: 2, hasFpi: false },
    { id: 3, dirty: true, flushing: false, lsn: 7, hasFpi: true },
    { id: 4, dirty: true, flushing: false, lsn: 9, hasFpi: false },
    { id: 5, dirty: false, flushing: false, lsn: 1, hasFpi: false },
    { id: 6, dirty: true, flushing: false, lsn: 8, hasFpi: true },
  ]);

  const [wal, setWal] = useState<WalEntry[]>([
    { lsn: 1, label: 'UPDATE p5', checkpointed: false },
    { lsn: 2, label: 'UPDATE p2', checkpointed: false },
    { lsn: 3, label: 'INSERT p1', checkpointed: false },
    { lsn: 4, label: 'DELETE p3', checkpointed: false },
    { lsn: 5, label: 'UPDATE p1 (FPI)', checkpointed: false },
    { lsn: 6, label: 'CHECKPOINT START', checkpointed: false },
    { lsn: 7, label: 'UPDATE p3 (FPI)', checkpointed: false },
    { lsn: 8, label: 'UPDATE p6 (FPI)', checkpointed: false },
    { lsn: 9, label: 'INSERT p4', checkpointed: false },
  ]);

  const [checkpointLsn, setCheckpointLsn] = useState(0);
  const [isCheckpointing, setIsCheckpointing] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'flushing' | 'writing-record' | 'done'>('idle');
  const [fpiReset, setFpiReset] = useState(false);

  const delay = useCallback((ms: number) => new Promise(r => setTimeout(r, ms)), []);

  const runCheckpoint = async () => {
    setIsCheckpointing(true);
    setPhase('flushing');

    // Flush dirty pages one by one
    const dirtyIds = pages.filter(p => p.dirty).map(p => p.id);
    for (const pid of dirtyIds) {
      setPages(prev => prev.map(p => p.id === pid ? { ...p, flushing: true } : p));
      await delay(600);
      setPages(prev => prev.map(p => p.id === pid ? { ...p, dirty: false, flushing: false } : p));
    }

    // Mark WAL entries as checkpointed
    setPhase('writing-record');
    await delay(500);
    setWal(prev => prev.map(e => ({ ...e, checkpointed: true })));
    setCheckpointLsn(9);
    setWal(prev => [...prev, { lsn: 10, label: 'CHECKPOINT END (LSN=9)', checkpointed: true }]);

    // Reset FPI flags
    await delay(500);
    setFpiReset(true);
    setPages(prev => prev.map(p => ({ ...p, hasFpi: false })));

    setPhase('done');
    setIsCheckpointing(false);
  };

  const modifyPage = () => {
    // Simulate a new write after checkpoint
    const cleanPages = pages.filter(p => !p.dirty);
    if (cleanPages.length === 0) return;
    const target = cleanPages[0];
    const newLsn = (wal.length > 0 ? Math.max(...wal.map(e => e.lsn)) : 0) + 1;

    setPages(prev => prev.map(p =>
      p.id === target.id ? { ...p, dirty: true, lsn: newLsn, hasFpi: fpiReset } : p
    ));
    setWal(prev => [...prev, {
      lsn: newLsn,
      label: `UPDATE p${target.id}${fpiReset ? ' (FPI — first after checkpoint!)' : ''}`,
      checkpointed: false,
    }]);
  };

  const pageColor = (p: Page): string => {
    if (p.flushing) return '#fbbf24';
    if (p.dirty) return '#ef4444';
    return '#22c55e';
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <button
          onClick={runCheckpoint}
          disabled={isCheckpointing || phase === 'done'}
          style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', opacity: isCheckpointing || phase === 'done' ? 0.5 : 1 }}
        >
          Run Checkpoint
        </button>
        <button
          onClick={modifyPage}
          disabled={isCheckpointing}
          style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid #6366f1', background: 'transparent', color: '#6366f1', cursor: 'pointer', opacity: isCheckpointing ? 0.5 : 1 }}
        >
          + Write (modify a page)
        </button>
        <span style={{ fontSize: '12px', color: '#9ca3af', alignSelf: 'center' }}>
          Phase: <strong style={{ color: '#6366f1' }}>{phase}</strong>
          {checkpointLsn > 0 && <> | Checkpoint LSN: <strong>{checkpointLsn}</strong></>}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        {/* Buffer Pool */}
        <div style={{ flex: 1, minWidth: '200px' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Buffer Pool</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
            {pages.map(p => (
              <motion.div
                key={p.id}
                animate={{
                  scale: p.flushing ? [1, 1.1, 1] : 1,
                  borderColor: pageColor(p),
                }}
                transition={{ duration: 0.3 }}
                style={{
                  padding: '8px',
                  borderRadius: '6px',
                  border: `2px solid ${pageColor(p)}`,
                  background: `${pageColor(p)}15`,
                  textAlign: 'center',
                  fontSize: '11px',
                }}
              >
                <div style={{ fontWeight: 700 }}>Page {p.id}</div>
                <div style={{ color: '#9ca3af' }}>LSN: {p.lsn}</div>
                <div style={{ color: pageColor(p), fontSize: '10px' }}>
                  {p.flushing ? '⏳ Flushing...' : p.dirty ? '● Dirty' : '○ Clean'}
                </div>
                {p.hasFpi && (
                  <div style={{ color: '#fbbf24', fontSize: '10px' }}>FPI ★</div>
                )}
              </motion.div>
            ))}
          </div>
          <div style={{ marginTop: '8px', fontSize: '11px', display: 'flex', gap: '12px', color: '#9ca3af' }}>
            <span><span style={{ color: '#ef4444' }}>●</span> Dirty</span>
            <span><span style={{ color: '#22c55e' }}>○</span> Clean</span>
            <span><span style={{ color: '#fbbf24' }}>⏳</span> Flushing</span>
            <span><span style={{ color: '#fbbf24' }}>★</span> FPI</span>
          </div>
        </div>

        {/* WAL */}
        <div style={{ flex: 1, minWidth: '220px' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>WAL File</h4>
          <div style={{ maxHeight: '260px', overflowY: 'auto', fontSize: '11px', fontFamily: 'monospace', background: 'rgba(30,30,40,0.5)', borderRadius: '6px', padding: '8px' }}>
            {wal.map((entry, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                style={{
                  padding: '3px 6px',
                  borderRadius: '3px',
                  marginBottom: '2px',
                  background: entry.checkpointed ? 'rgba(34,197,94,0.1)' : 'transparent',
                  color: entry.label.includes('CHECKPOINT') ? '#fbbf24'
                    : entry.label.includes('FPI') ? '#c084fc'
                      : entry.checkpointed ? '#4ade80' : '#d1d5db',
                  textDecoration: entry.checkpointed && !entry.label.includes('CHECKPOINT') ? 'line-through' : 'none',
                  opacity: entry.checkpointed && !entry.label.includes('CHECKPOINT') ? 0.5 : 1,
                }}
              >
                [{entry.lsn}] {entry.label}
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Explanation */}
      <AnimatePresence>
        {phase === 'done' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ marginTop: '12px', padding: '10px', borderRadius: '6px', background: 'rgba(99,102,241,0.1)', fontSize: '12px', color: '#a5b4fc', lineHeight: 1.5 }}
          >
            Checkpoint complete! All dirty pages flushed. WAL entries before checkpoint can be recycled.
            Next writes to any page will include a <strong>Full-Page Image (FPI)</strong> — the first write to a page after a checkpoint logs the entire page to protect against torn writes.
            Try clicking "Write" to see FPI generation.
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
