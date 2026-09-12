import { useState } from 'react';
import { motion } from 'framer-motion';

interface CellInfo {
  title: string;
  recovery: string;
  examples: string;
  pros: string;
  cons: string;
  isCommon: boolean;
}

const CELLS: Record<string, CellInfo> = {
  'no-steal-force': {
    title: 'No-Steal + Force',
    recovery: 'No recovery needed! Committed data is always on disk. Uncommitted data is never on disk.',
    examples: 'Early systems, some embedded DBs, toy implementations',
    pros: 'Simplest possible recovery (none). Easy to reason about.',
    cons: 'Terrible performance. Every COMMIT forces random I/O. Buffer pool cannot evict dirty pages from active transactions — memory pressure under load.',
    isCommon: false,
  },
  'no-steal-no-force': {
    title: 'No-Steal + No-Force',
    recovery: 'REDO only. Committed data might not be on disk yet, so replay log forward. No UNDO needed because uncommitted pages are never written to disk.',
    examples: 'Some research prototypes',
    pros: 'No undo logic needed. Fast commits (no force).',
    cons: 'Buffer pool must hold ALL dirty pages of active transactions in memory — can run out under long transactions or memory pressure.',
    isCommon: false,
  },
  'steal-force': {
    title: 'Steal + Force',
    recovery: 'UNDO only. Uncommitted pages may be on disk (stolen), so undo them. No redo needed because committed data is always forced to disk.',
    examples: 'Some older systems',
    pros: 'No redo pass. Committed data always safe on crash.',
    cons: 'Force at commit is slow (random I/O). Undo logic needed for stolen pages.',
    isCommon: false,
  },
  'steal-no-force': {
    title: 'Steal + No-Force',
    recovery: 'Both REDO and UNDO needed. REDO: committed data might not be on disk. UNDO: uncommitted data might be on disk. This is the ARIES model.',
    examples: 'PostgreSQL, MySQL/InnoDB, SQL Server, Oracle, DB2, SQLite (WAL mode), virtually all production databases',
    pros: 'Best performance. Buffer pool is free to evict any page. Commits only need sequential WAL write. The WAL protocol makes this safe.',
    cons: 'Most complex recovery (3-pass ARIES). Requires WAL with both redo and undo information.',
    isCommon: true,
  },
};

export default function StealForceMatrix() {
  const [selected, setSelected] = useState<string | null>('steal-no-force');

  const cellStyle = (key: string): React.CSSProperties => ({
    padding: '16px',
    borderRadius: '8px',
    border: `2px solid ${selected === key ? '#6366f1' : '#374151'}`,
    background: selected === key
      ? 'rgba(99,102,241,0.15)'
      : CELLS[key].isCommon
        ? 'rgba(99,102,241,0.05)'
        : 'rgba(30,30,40,0.5)',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.2s ease',
    position: 'relative' as const,
  });

  const info = selected ? CELLS[selected] : null;

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      <p style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '12px' }}>
        Click each cell to explore its implications. The highlighted cell is what virtually all production databases use.
      </p>

      {/* Matrix */}
      <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gridTemplateRows: 'auto auto auto', gap: '4px', marginBottom: '16px' }}>
        {/* Header row */}
        <div />
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '13px', color: '#6366f1', padding: '8px' }}>No-Steal</div>
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '13px', color: '#6366f1', padding: '8px' }}>Steal</div>

        {/* Force row */}
        <div style={{ fontWeight: 700, fontSize: '13px', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Force</div>
        <div style={cellStyle('no-steal-force')} onClick={() => setSelected('no-steal-force')}>
          <div style={{ fontSize: '13px', fontWeight: 600 }}>No Redo, No Undo</div>
          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>Simplest</div>
        </div>
        <div style={cellStyle('steal-force')} onClick={() => setSelected('steal-force')}>
          <div style={{ fontSize: '13px', fontWeight: 600 }}>No Redo, UNDO</div>
          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>Undo only</div>
        </div>

        {/* No-Force row */}
        <div style={{ fontWeight: 700, fontSize: '13px', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No-Force</div>
        <div style={cellStyle('no-steal-no-force')} onClick={() => setSelected('no-steal-no-force')}>
          <div style={{ fontSize: '13px', fontWeight: 600 }}>REDO, No Undo</div>
          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>Redo only</div>
        </div>
        <div style={cellStyle('steal-no-force')} onClick={() => setSelected('steal-no-force')}>
          <div style={{ fontSize: '13px', fontWeight: 600 }}>REDO + UNDO</div>
          <div style={{ fontSize: '11px', color: '#22c55e', marginTop: '4px' }}>★ Industry standard</div>
        </div>
      </div>

      {/* Detail panel */}
      {info && (
        <motion.div
          key={selected}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            padding: '16px',
            borderRadius: '8px',
            border: '1px solid #374151',
            background: 'rgba(30,30,40,0.5)',
            fontSize: '13px',
            lineHeight: 1.6,
          }}
        >
          <h4 style={{ margin: '0 0 8px', color: '#6366f1' }}>{info.title}</h4>
          <div style={{ marginBottom: '8px' }}>
            <strong style={{ color: '#fbbf24' }}>Recovery:</strong> {info.recovery}
          </div>
          <div style={{ marginBottom: '8px' }}>
            <strong style={{ color: '#22c55e' }}>Used by:</strong> {info.examples}
          </div>
          <div style={{ marginBottom: '8px' }}>
            <strong style={{ color: '#60a5fa' }}>Pros:</strong> {info.pros}
          </div>
          <div>
            <strong style={{ color: '#f87171' }}>Cons:</strong> {info.cons}
          </div>
        </motion.div>
      )}
    </div>
  );
}
