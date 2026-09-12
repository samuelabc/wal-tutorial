import { useState } from 'react';
import { motion } from 'framer-motion';

interface Field {
  name: string;
  size: string;
  color: string;
  desc: string;
}

interface Format {
  name: string;
  description: string;
  fields: Field[];
}

const FORMATS: Record<string, Format> = {
  postgres: {
    name: 'PostgreSQL XLogRecord',
    description: 'Fixed header (24 bytes) followed by variable block references and data. Each record is MAXALIGN-aligned. Records can span WAL pages (8KB default).',
    fields: [
      { name: 'xl_tot_len', size: '4B', color: '#6366f1', desc: 'Total record length including header and all data' },
      { name: 'xl_xid', size: '4B', color: '#60a5fa', desc: 'Transaction ID that produced this record' },
      { name: 'xl_prev', size: '8B', color: '#8b5cf6', desc: 'LSN of the previous record in the log (chain link)' },
      { name: 'xl_info', size: '1B', color: '#c084fc', desc: 'Resource-manager-specific flags (rmgr opcode) + global flags' },
      { name: 'xl_rmid', size: '1B', color: '#a78bfa', desc: 'Resource manager ID (Heap=10, Btree=11, Transaction=1, etc.)' },
      { name: 'padding', size: '2B', color: '#374151', desc: 'Alignment padding' },
      { name: 'xl_crc', size: '4B', color: '#ef4444', desc: 'CRC-32C checksum over entire record (excluding this field)' },
      { name: 'BlockHeader[]', size: 'var', color: '#f59e0b', desc: 'Per-block references: fork, flags, optional FPI, RelFileLocator, BlockNumber' },
      { name: 'FPI data', size: 'var', color: '#fb923c', desc: 'Full Page Image — compressed or raw 8KB page snapshot (if BKPBLOCK_HAS_IMAGE)' },
      { name: 'Main data', size: 'var', color: '#22c55e', desc: 'Resource-manager-specific payload (e.g., tuple data for heap insert)' },
    ],
  },
  leveldb: {
    name: 'LevelDB/RocksDB Block Format',
    description: 'WAL is a sequence of 32KB blocks. Records have a 7-byte header and can be fragmented across blocks using FIRST/MIDDLE/LAST types.',
    fields: [
      { name: 'checksum', size: '4B', color: '#ef4444', desc: 'CRC-32C of type + data bytes (with pre-computed type seeds)' },
      { name: 'length', size: '2B', color: '#6366f1', desc: 'Length of the data portion (max ~32KB minus header)' },
      { name: 'type', size: '1B', color: '#f59e0b', desc: 'FULL=1, FIRST=2, MIDDLE=3, LAST=4 (fragment type within block)' },
      { name: 'data', size: 'var', color: '#22c55e', desc: 'Record payload — WriteBatch bytes containing put/delete operations' },
      { name: '(block padding)', size: 'var', color: '#374151', desc: 'Zero-fill to 32KB boundary. If <7 bytes remain in block, pad to next block.' },
    ],
  },
  sqlite: {
    name: 'SQLite WAL Frame',
    description: 'WAL file is a header (32 bytes) followed by frames. Each frame contains a frame header (24 bytes) + one complete database page.',
    fields: [
      { name: 'page_number', size: '4B', color: '#6366f1', desc: 'Database page number this frame overwrites' },
      { name: 'commit_size', size: '4B', color: '#22c55e', desc: 'Size of database in pages after commit (0 if not a commit frame)' },
      { name: 'salt_1', size: '4B', color: '#c084fc', desc: 'Salt value copied from WAL header (integrity check)' },
      { name: 'salt_2', size: '4B', color: '#a78bfa', desc: 'Salt value copied from WAL header' },
      { name: 'checksum_1', size: '4B', color: '#ef4444', desc: 'Cumulative checksum-1 over header + page data' },
      { name: 'checksum_2', size: '4B', color: '#f87171', desc: 'Cumulative checksum-2 over header + page data' },
      { name: 'page_data', size: 'page_size', color: '#f59e0b', desc: 'Complete database page (default 4KB). Entire page stored, not a diff.' },
    ],
  },
  innodb: {
    name: 'InnoDB Redo Log Block',
    description: 'Redo log stored in 512-byte blocks with 12-byte header and 4-byte trailer. Mini-transaction (mtr) records are grouped atomically within blocks.',
    fields: [
      { name: 'LOG_BLOCK_HDR_NO', size: '4B', color: '#6366f1', desc: 'Block number (identifies position in circular log)' },
      { name: 'LOG_BLOCK_DATA_LEN', size: '2B', color: '#60a5fa', desc: 'Bytes of log data in this block (up to 496)' },
      { name: 'LOG_BLOCK_FIRST_REC_GRP', size: '2B', color: '#8b5cf6', desc: 'Offset of first mtr boundary in block (for recovery start)' },
      { name: 'LOG_BLOCK_CHECKPOINT_NO', size: '4B', color: '#c084fc', desc: 'Checkpoint number when block was last written' },
      { name: 'redo records', size: '≤496B', color: '#22c55e', desc: 'Mini-transaction redo records (type byte + space_id + page_no + payload)' },
      { name: 'LOG_BLOCK_CHECKSUM', size: '4B', color: '#ef4444', desc: 'CRC-32C checksum of entire block' },
    ],
  },
};

export default function WalFormatExplorer() {
  const [selected, setSelected] = useState('postgres');
  const [hoveredField, setHoveredField] = useState<Field | null>(null);
  const format = FORMATS[selected];

  const tabStyle = (key: string): React.CSSProperties => ({
    padding: '6px 14px',
    borderRadius: '6px 6px 0 0',
    border: `1px solid ${selected === key ? '#6366f1' : '#374151'}`,
    borderBottom: selected === key ? '1px solid transparent' : '1px solid #374151',
    background: selected === key ? 'rgba(99,102,241,0.1)' : 'transparent',
    color: selected === key ? '#6366f1' : '#9ca3af',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: selected === key ? 700 : 400,
  });

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '-1px', position: 'relative', zIndex: 1 }}>
        {Object.entries(FORMATS).map(([key, fmt]) => (
          <button key={key} style={tabStyle(key)} onClick={() => { setSelected(key); setHoveredField(null); }}>
            {fmt.name.split(' ')[0]}
          </button>
        ))}
      </div>

      <div style={{ border: '1px solid #374151', borderRadius: '0 8px 8px 8px', padding: '16px', background: 'rgba(30,30,40,0.5)' }}>
        <h4 style={{ margin: '0 0 4px', fontSize: '14px', color: '#6366f1' }}>{format.name}</h4>
        <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#9ca3af', lineHeight: 1.4 }}>{format.description}</p>

        {/* Visual format layout */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginBottom: '12px' }}>
          {format.fields.map((field, i) => (
            <motion.div
              key={`${selected}-${i}`}
              onMouseEnter={() => setHoveredField(field)}
              onMouseLeave={() => setHoveredField(null)}
              whileHover={{ scale: 1.05, y: -2 }}
              style={{
                padding: '8px 12px',
                borderRadius: '4px',
                border: `2px solid ${field.color}`,
                background: `${field.color}15`,
                cursor: 'pointer',
                textAlign: 'center',
                minWidth: '60px',
                transition: 'background 0.2s',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 700, color: field.color, fontFamily: 'monospace' }}>
                {field.name}
              </div>
              <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{field.size}</div>
            </motion.div>
          ))}
        </div>

        {/* Hover detail */}
        <div style={{
          minHeight: '48px',
          padding: '10px',
          borderRadius: '6px',
          background: hoveredField ? `${hoveredField.color}10` : 'rgba(30,30,40,0.3)',
          border: `1px solid ${hoveredField ? hoveredField.color : '#374151'}`,
          fontSize: '12px',
          color: '#d1d5db',
          lineHeight: 1.5,
          transition: 'all 0.2s',
        }}>
          {hoveredField ? (
            <>
              <span style={{ color: hoveredField.color, fontWeight: 700, fontFamily: 'monospace' }}>{hoveredField.name}</span>
              <span style={{ color: '#6b7280' }}> ({hoveredField.size})</span>
              <span style={{ color: '#9ca3af' }}> — </span>
              {hoveredField.desc}
            </>
          ) : (
            <span style={{ color: '#6b7280' }}>Hover over a field to see its description</span>
          )}
        </div>
      </div>
    </div>
  );
}
