import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Transaction {
  id: number;
  label: string;
  state: 'waiting' | 'in-batch' | 'syncing' | 'committed';
  batchId: number;
}

export default function GroupCommitDemo() {
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [batchCount, setBatchCount] = useState(0);
  const [fsyncCount, setFsyncCount] = useState(0);
  const [commitDelay, setCommitDelay] = useState(5);
  const [isRunning, setIsRunning] = useState(false);
  const [totalCommitted, setTotalCommitted] = useState(0);
  const nextId = useRef(1);

  const reset = () => {
    setTxns([]);
    setBatchCount(0);
    setFsyncCount(0);
    setTotalCommitted(0);
    setIsRunning(false);
    nextId.current = 1;
  };

  const runDemo = async () => {
    setIsRunning(true);
    reset();
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

    // Simulate 3 rounds of group commit
    for (let round = 0; round < 3; round++) {
      // Transactions arrive during commit_delay window
      const count = 2 + Math.floor(Math.random() * 3); // 2-4 txns per batch
      const newTxns: Transaction[] = [];

      for (let i = 0; i < count; i++) {
        const txn: Transaction = {
          id: nextId.current++,
          label: `T${nextId.current - 1}`,
          state: 'waiting',
          batchId: round,
        };
        newTxns.push(txn);
        setTxns(prev => [...prev, txn]);
        await delay(commitDelay * 30); // Scaled delay
      }

      // Move all waiting to in-batch
      setTxns(prev => prev.map(t =>
        t.state === 'waiting' ? { ...t, state: 'in-batch' } : t
      ));
      await delay(300);

      // Single fsync for entire batch
      setTxns(prev => prev.map(t =>
        t.state === 'in-batch' ? { ...t, state: 'syncing' } : t
      ));
      await delay(400);

      setFsyncCount(prev => prev + 1);
      setBatchCount(prev => prev + 1);

      // All committed
      setTxns(prev => prev.map(t =>
        t.state === 'syncing' ? { ...t, state: 'committed' } : t
      ));
      setTotalCommitted(prev => prev + count);
      await delay(600);
    }

    setIsRunning(false);
  };

  const stateColor = (state: string) => {
    switch (state) {
      case 'waiting': return '#fbbf24';
      case 'in-batch': return '#60a5fa';
      case 'syncing': return '#c084fc';
      case 'committed': return '#22c55e';
      default: return '#6b7280';
    }
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={runDemo}
          disabled={isRunning}
          style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', opacity: isRunning ? 0.5 : 1 }}
        >
          ▶ Run Group Commit
        </button>
        <button
          onClick={reset}
          style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid #374151', background: 'transparent', color: '#9ca3af', cursor: 'pointer' }}
        >
          ↺ Reset
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#9ca3af' }}>
          commit_delay:
          <input
            type="range" min="1" max="15" value={commitDelay}
            onChange={e => setCommitDelay(parseInt(e.target.value))}
            style={{ width: '80px' }}
            disabled={isRunning}
          />
          {commitDelay}ms
        </label>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', fontSize: '13px' }}>
        <div style={{ padding: '8px 14px', borderRadius: '6px', background: 'rgba(99,102,241,0.1)', border: '1px solid #374151' }}>
          <div style={{ color: '#9ca3af', fontSize: '10px', textTransform: 'uppercase' }}>Transactions</div>
          <div style={{ fontWeight: 700, color: '#6366f1', fontSize: '18px' }}>{totalCommitted}</div>
        </div>
        <div style={{ padding: '8px 14px', borderRadius: '6px', background: 'rgba(192,132,252,0.1)', border: '1px solid #374151' }}>
          <div style={{ color: '#9ca3af', fontSize: '10px', textTransform: 'uppercase' }}>fsync() calls</div>
          <div style={{ fontWeight: 700, color: '#c084fc', fontSize: '18px' }}>{fsyncCount}</div>
        </div>
        <div style={{ padding: '8px 14px', borderRadius: '6px', background: 'rgba(34,197,94,0.1)', border: '1px solid #374151' }}>
          <div style={{ color: '#9ca3af', fontSize: '10px', textTransform: 'uppercase' }}>Ratio</div>
          <div style={{ fontWeight: 700, color: '#22c55e', fontSize: '18px' }}>
            {fsyncCount > 0 ? `${(totalCommitted / fsyncCount).toFixed(1)}:1` : '—'}
          </div>
        </div>
      </div>

      {/* Transaction flow */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', minHeight: '40px' }}>
        <AnimatePresence>
          {txns.map(t => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{
                padding: '4px 10px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: 600,
                border: `1px solid ${stateColor(t.state)}`,
                background: `${stateColor(t.state)}20`,
                color: stateColor(t.state),
              }}
            >
              {t.label}
              {t.state === 'syncing' && ' ⏳'}
              {t.state === 'committed' && ' ✓'}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Legend */}
      <div style={{ marginTop: '12px', fontSize: '11px', display: 'flex', gap: '12px', color: '#9ca3af', flexWrap: 'wrap' }}>
        <span><span style={{ color: '#fbbf24' }}>●</span> Waiting (arrived during delay)</span>
        <span><span style={{ color: '#60a5fa' }}>●</span> Batched</span>
        <span><span style={{ color: '#c084fc' }}>●</span> Syncing (shared fsync)</span>
        <span><span style={{ color: '#22c55e' }}>●</span> Committed</span>
      </div>

      {/* Explanation */}
      {totalCommitted > 0 && !isRunning && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ marginTop: '12px', padding: '10px', borderRadius: '6px', background: 'rgba(99,102,241,0.1)', fontSize: '12px', color: '#a5b4fc', lineHeight: 1.5 }}
        >
          <strong>{totalCommitted} transactions</strong> committed with only <strong>{fsyncCount} fsync calls</strong> ({(totalCommitted / fsyncCount).toFixed(1)} txns per fsync).
          Without group commit, each transaction would need its own fsync — {totalCommitted} fsyncs total.
          {commitDelay >= 8 && ' Higher commit_delay batches more transactions but adds latency per commit.'}
          {commitDelay <= 3 && ' Lower commit_delay means smaller batches but lower per-transaction latency.'}
        </motion.div>
      )}
    </div>
  );
}
