import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface WalRecord {
  lsn: number;
  label: string;
  sentToPrimary: boolean;
  receivedByStandby: boolean;
  replayed: boolean;
  consumedByCdc: boolean;
}

export default function ReplicationFlowDemo() {
  const [records, setRecords] = useState<WalRecord[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [writeLsn, setWriteLsn] = useState(0);
  const [sentLsn, setSentLsn] = useState(0);
  const [receiveLsn, setReceiveLsn] = useState(0);
  const [replayLsn, setReplayLsn] = useState(0);
  const [cdcLsn, setCdcLsn] = useState(0);
  const [lagEnabled, setLagEnabled] = useState(false);
  const nextLsn = useRef(1);

  const reset = () => {
    setRecords([]);
    setIsRunning(false);
    setWriteLsn(0);
    setSentLsn(0);
    setReceiveLsn(0);
    setReplayLsn(0);
    setCdcLsn(0);
    nextLsn.current = 1;
  };

  const runDemo = async () => {
    setIsRunning(true);
    reset();
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
    const ops = ['INSERT users(Alice)', 'UPDATE balance=500', 'DELETE old_log', 'INSERT orders(#42)', 'UPDATE status=shipped', 'COMMIT batch'];

    for (let i = 0; i < ops.length; i++) {
      const lsn = nextLsn.current++;
      const rec: WalRecord = { lsn, label: ops[i], sentToPrimary: true, receivedByStandby: false, replayed: false, consumedByCdc: false };

      // Write to primary WAL
      setRecords(prev => [...prev, rec]);
      setWriteLsn(lsn);
      await delay(400);

      // Walsender ships to standby
      setSentLsn(lsn);
      await delay(lagEnabled ? 800 : 200);

      // Walreceiver receives
      setRecords(prev => prev.map(r => r.lsn === lsn ? { ...r, receivedByStandby: true } : r));
      setReceiveLsn(lsn);
      await delay(lagEnabled ? 600 : 150);

      // Startup process replays
      setRecords(prev => prev.map(r => r.lsn === lsn ? { ...r, replayed: true } : r));
      setReplayLsn(lsn);
      await delay(lagEnabled ? 400 : 100);

      // CDC consumer reads
      setRecords(prev => prev.map(r => r.lsn === lsn ? { ...r, consumedByCdc: true } : r));
      setCdcLsn(lsn);
      await delay(200);
    }

    setIsRunning(false);
  };

  const nodeStyle = (label: string, color: string, lsn: number): React.CSSProperties => ({
    padding: '12px 16px',
    borderRadius: '8px',
    border: `2px solid ${color}`,
    background: `${color}10`,
    textAlign: 'center',
    flex: 1,
    minWidth: '120px',
  });

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={runDemo} disabled={isRunning}
          style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', opacity: isRunning ? 0.5 : 1 }}>
          ▶ Run Replication
        </button>
        <button onClick={reset}
          style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid #374151', background: 'transparent', color: '#9ca3af', cursor: 'pointer' }}>
          ↺ Reset
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#9ca3af' }}>
          <input type="checkbox" checked={lagEnabled} onChange={e => setLagEnabled(e.target.checked)} disabled={isRunning} />
          Simulate replication lag
        </label>
      </div>

      {/* Architecture flow */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div style={nodeStyle('Primary', '#6366f1', writeLsn)}>
          <div style={{ fontWeight: 700, color: '#6366f1', fontSize: '13px' }}>Primary</div>
          <div style={{ fontSize: '11px', color: '#9ca3af' }}>write_lsn: {writeLsn}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', color: '#6366f1', fontSize: '18px' }}>→</div>
        <div style={nodeStyle('WAL', '#c084fc', sentLsn)}>
          <div style={{ fontWeight: 700, color: '#c084fc', fontSize: '13px' }}>walsender</div>
          <div style={{ fontSize: '11px', color: '#9ca3af' }}>sent_lsn: {sentLsn}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', color: '#c084fc', fontSize: '18px' }}>→</div>
        <div style={nodeStyle('Standby', '#22c55e', replayLsn)}>
          <div style={{ fontWeight: 700, color: '#22c55e', fontSize: '13px' }}>Standby</div>
          <div style={{ fontSize: '11px', color: '#9ca3af' }}>receive: {receiveLsn} | replay: {replayLsn}</div>
        </div>
      </div>

      {/* CDC */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <div style={{ flex: 1, height: '1px', background: '#374151' }} />
        <div style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #f59e0b', background: 'rgba(245,158,11,0.1)', fontSize: '12px' }}>
          <span style={{ fontWeight: 700, color: '#f59e0b' }}>CDC Consumer</span>
          <span style={{ color: '#9ca3af' }}> confirmed_lsn: {cdcLsn}</span>
        </div>
        <div style={{ flex: 1, height: '1px', background: '#374151' }} />
      </div>

      {/* Records */}
      <div style={{ fontSize: '11px', fontFamily: 'monospace', background: 'rgba(30,30,40,0.5)', borderRadius: '6px', padding: '8px', maxHeight: '180px', overflowY: 'auto' }}>
        <AnimatePresence>
          {records.map(r => (
            <motion.div
              key={r.lsn}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              style={{ display: 'flex', gap: '8px', padding: '2px 0', alignItems: 'center' }}
            >
              <span style={{ color: '#6b7280', width: '40px' }}>[{r.lsn}]</span>
              <span style={{ color: '#d1d5db', flex: 1 }}>{r.label}</span>
              <span style={{ color: r.sentToPrimary ? '#6366f1' : '#374151' }}>W</span>
              <span style={{ color: r.receivedByStandby ? '#c084fc' : '#374151' }}>R</span>
              <span style={{ color: r.replayed ? '#22c55e' : '#374151' }}>P</span>
              <span style={{ color: r.consumedByCdc ? '#f59e0b' : '#374151' }}>C</span>
            </motion.div>
          ))}
        </AnimatePresence>
        {records.length === 0 && <div style={{ color: '#6b7280' }}>Click Run to start...</div>}
      </div>

      {/* Lag indicator */}
      {writeLsn > 0 && (
        <div style={{ marginTop: '8px', display: 'flex', gap: '12px', fontSize: '11px', flexWrap: 'wrap' }}>
          <span style={{ color: '#9ca3af' }}>Lag: </span>
          <span style={{ color: writeLsn - replayLsn > 2 ? '#ef4444' : '#22c55e' }}>
            write→replay: {writeLsn - replayLsn} records
          </span>
          <span style={{ color: writeLsn - cdcLsn > 2 ? '#f59e0b' : '#22c55e' }}>
            write→cdc: {writeLsn - cdcLsn} records
          </span>
        </div>
      )}

      <div style={{ marginTop: '8px', fontSize: '10px', color: '#6b7280' }}>
        W=Written R=Received P=Replayed C=CDC consumed
      </div>
    </div>
  );
}
