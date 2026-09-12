// @ts-check
import { defineConfig } from 'astro/config';
import mermaid from 'astro-mermaid';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';

export default defineConfig({
  integrations: [
    mermaid(),
    starlight({
      title: 'WAL: The Definitive Tutorial',
      description: 'Write-Ahead Logging from fundamentals to industry expert',
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        {
          label: 'Foundations',
          items: [
            { label: 'The Crash Problem', slug: '01-foundations/01-the-crash-problem' },
            { label: 'ACID & Durability', slug: '01-foundations/02-acid-and-durability' },
            { label: 'Steal/Force Matrix', slug: '01-foundations/03-steal-force-matrix' },
            { label: 'The WAL Protocol', slug: '01-foundations/04-the-wal-protocol' },
          ],
        },
        {
          label: 'Core Mechanics',
          items: [
            { label: 'Log Records & LSN', slug: '02-core-mechanics/01-log-records-and-lsn' },
            { label: 'WAL File Formats', slug: '02-core-mechanics/02-wal-file-formats' },
            { label: 'Checkpoints', slug: '02-core-mechanics/03-checkpoints' },
            { label: 'Group Commit', slug: '02-core-mechanics/04-group-commit' },
            { label: 'Concurrency', slug: '02-core-mechanics/05-concurrency' },
          ],
        },
        {
          label: 'ARIES Recovery',
          items: [
            { label: 'Overview', slug: '03-aries/01-overview' },
            { label: 'Analysis Pass', slug: '03-aries/02-analysis-pass' },
            { label: 'Redo Pass', slug: '03-aries/03-redo-pass' },
            { label: 'Undo Pass & CLRs', slug: '03-aries/04-undo-pass' },
            { label: 'Worked Example', slug: '03-aries/05-worked-example' },
          ],
        },
        {
          label: 'Real Systems',
          items: [
            { label: 'SQLite WAL', slug: '04-real-systems/01-sqlite-wal' },
            { label: 'PostgreSQL WAL', slug: '04-real-systems/02-postgresql-wal' },
            { label: 'InnoDB Redo/Undo', slug: '04-real-systems/03-innodb-redo-undo' },
            { label: 'LSM Engines', slug: '04-real-systems/04-lsm-engines' },
          ],
        },
        {
          label: 'Distributed WAL',
          items: [
            { label: 'Raft Consensus Log', slug: '05-distributed/01-raft-consensus-log' },
            { label: 'Distributed Databases', slug: '05-distributed/02-distributed-databases' },
            { label: 'CDC from WAL', slug: '05-distributed/03-cdc-from-wal' },
            { label: 'Event Sourcing', slug: '05-distributed/04-event-sourcing' },
          ],
        },
        {
          label: 'Expert Topics',
          items: [
            { label: 'Performance Tuning', slug: '06-expert/01-performance-tuning' },
            { label: 'Modern Hardware', slug: '06-expert/02-modern-hardware' },
            { label: 'Debugging Corruption', slug: '06-expert/03-debugging-corruption' },
            { label: 'Pitfalls & Anti-Patterns', slug: '06-expert/04-pitfalls-antipatterns' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Cheat Sheet', slug: '07-reference/01-cheat-sheet' },
            { label: 'Interview Questions', slug: '07-reference/02-interview-questions' },
            { label: 'Papers & Reading List', slug: '07-reference/03-papers-reading-list' },
            { label: 'Glossary', slug: '07-reference/04-glossary' },
          ],
        },
      ],
    }),
    react(),
  ],
});
