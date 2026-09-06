/**
 * <TranscriptDocument>
 * ----------------------------------------------------------------------------
 * Pure presentational renderer for a `TranscriptData` payload. Shared between
 * the learner self-view (`/pde/learn/transcript`) and admin view
 * (`/pde/admin/transcript/[learnerId]`).
 *
 * Designed for browser-print → PDF (no server-side PDF library). The print
 * stylesheet is embedded inline via a single <style> block so this component
 * renders correctly even outside the dashboard layout.
 *
 * Phase: PDE Tier 4 — T4.4 (2026-05-19).
 */

import type { TranscriptData } from '@/lib/services/pde-transcript-service';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function TranscriptDocument({ data }: { data: TranscriptData }) {
  const { learner, institution, generated_at, agency_index, totals } = data;

  return (
    <>
      {/* Print stylesheet — inline so the document is self-contained. */}
      <style>{`
        .pde-transcript {
          font-family: 'Times New Roman', Georgia, serif;
          color: #111;
          background: #fff;
          max-width: 800px;
          margin: 0 auto;
          padding: 32px 40px;
          line-height: 1.5;
        }
        .pde-transcript .header-band {
          display: flex;
          align-items: center;
          gap: 16px;
          border-bottom: 3px double #111;
          padding-bottom: 16px;
          margin-bottom: 24px;
        }
        .pde-transcript .logo-placeholder {
          width: 72px;
          height: 72px;
          border: 2px solid #1E40AF;
          color: #1E40AF;
          font-weight: 700;
          font-size: 11px;
          text-align: center;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .pde-transcript .header-text {
          flex: 1;
        }
        .pde-transcript .header-text h1 {
          font-size: 22px;
          margin: 0 0 4px;
          font-weight: 700;
          letter-spacing: 0.5px;
        }
        .pde-transcript .header-text .subtitle {
          font-size: 13px;
          color: #444;
          font-style: italic;
        }
        .pde-transcript .doc-title {
          text-align: center;
          font-size: 18px;
          font-weight: 700;
          letter-spacing: 2px;
          text-transform: uppercase;
          margin: 16px 0 20px;
        }
        .pde-transcript .learner-block {
          border: 1px solid #444;
          padding: 12px 16px;
          margin-bottom: 24px;
          font-size: 13px;
        }
        .pde-transcript .learner-block .row {
          display: flex;
          gap: 16px;
          margin-bottom: 4px;
        }
        .pde-transcript .learner-block .label {
          font-weight: 700;
          min-width: 140px;
        }
        .pde-transcript .summary-band {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin-bottom: 24px;
        }
        .pde-transcript .summary-cell {
          border: 1px solid #888;
          padding: 8px 10px;
          text-align: center;
        }
        .pde-transcript .summary-cell .num {
          font-size: 20px;
          font-weight: 700;
          color: #1E40AF;
        }
        .pde-transcript .summary-cell .lbl {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #444;
        }
        .pde-transcript h2 {
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 1px;
          border-bottom: 1px solid #111;
          padding-bottom: 4px;
          margin: 24px 0 12px;
        }
        .pde-transcript .category-block {
          margin-bottom: 16px;
          page-break-inside: avoid;
        }
        .pde-transcript .category-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 4px;
        }
        .pde-transcript .category-head h3 {
          font-size: 13px;
          font-weight: 700;
          margin: 0;
        }
        .pde-transcript .category-head .stats {
          font-size: 11px;
          color: #444;
        }
        .pde-transcript table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }
        .pde-transcript th, .pde-transcript td {
          border: 1px solid #aaa;
          padding: 4px 8px;
          text-align: left;
          vertical-align: top;
        }
        .pde-transcript th {
          background: #f3f4f6;
          font-weight: 700;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        .pde-transcript .empty {
          font-size: 11px;
          color: #777;
          font-style: italic;
          padding: 4px 0;
        }
        .pde-transcript .capabilities-list {
          font-size: 12px;
          list-style: square;
          padding-left: 20px;
        }
        .pde-transcript .capabilities-list li {
          margin-bottom: 2px;
        }
        .pde-transcript .agency-band {
          border: 2px solid #1E40AF;
          padding: 12px 16px;
          margin: 16px 0;
          display: flex;
          gap: 24px;
          align-items: center;
        }
        .pde-transcript .agency-band .score {
          font-size: 36px;
          font-weight: 700;
          color: #1E40AF;
        }
        .pde-transcript .signature {
          margin-top: 48px;
          display: flex;
          justify-content: space-between;
          gap: 24px;
          font-size: 12px;
        }
        .pde-transcript .sig-block {
          flex: 1;
          border-top: 1px solid #111;
          padding-top: 4px;
          text-align: center;
          font-size: 11px;
        }
        .pde-transcript .footer {
          margin-top: 32px;
          font-size: 9px;
          color: #777;
          text-align: center;
          border-top: 1px solid #ddd;
          padding-top: 8px;
        }
        .pde-transcript .print-hint {
          background: #FEF3C7;
          border: 1px solid #F59E0B;
          color: #92400E;
          padding: 8px 12px;
          font-size: 12px;
          margin-bottom: 16px;
          border-radius: 4px;
          font-family: system-ui, sans-serif;
        }
        @media print {
          .pde-transcript {
            padding: 12px 0;
            max-width: 100%;
          }
          .pde-transcript .print-hint,
          nav, header.app-header, aside, .no-print {
            display: none !important;
          }
          body { background: #fff; }
        }
        @media screen and (max-width: 639px) {
          .pde-transcript .summary-band {
            grid-template-columns: repeat(2, 1fr);
          }
          .pde-transcript .learner-block .row {
            flex-direction: column;
            gap: 2px;
          }
          .pde-transcript .learner-block .label {
            min-width: 0;
          }
          .pde-transcript .category-block {
            overflow-x: auto;
          }
        }
      `}</style>

      <div className="pde-transcript">
        <div className="print-hint no-print">
          Press <strong>Ctrl+P</strong> (Cmd+P on Mac) and choose &ldquo;Save as PDF&rdquo; to download this transcript.
        </div>

        {/* Header band — institution + logo placeholder */}
        <div className="header-band">
          <div className="logo-placeholder">JKKN</div>
          <div className="header-text">
            <h1>{institution.name ?? 'JKKN Institutions'}</h1>
            <div className="subtitle">
              {institution.department_name ?? 'Department of Professional Development & Evaluation'}
            </div>
          </div>
        </div>

        <div className="doc-title">PDE Transcript &mdash; Evidence of Durable Value</div>

        {/* Learner block */}
        <div className="learner-block">
          <div className="row">
            <span className="label">Name</span>
            <span>{learner.full_name ?? '—'}</span>
          </div>
          <div className="row">
            <span className="label">Learner ID</span>
            <span style={{ fontFamily: 'monospace' }}>{learner.id}</span>
          </div>
          <div className="row">
            <span className="label">Email</span>
            <span>{learner.email ?? '—'}</span>
          </div>
          <div className="row">
            <span className="label">Department</span>
            <span>{institution.department_name ?? '—'}</span>
          </div>
          <div className="row">
            <span className="label">Transcript generated</span>
            <span>{formatDateTime(generated_at)}</span>
          </div>
        </div>

        {/* Summary band */}
        <div className="summary-band">
          <div className="summary-cell">
            <div className="num">{totals.demonstrations_submitted}</div>
            <div className="lbl">Submitted</div>
          </div>
          <div className="summary-cell">
            <div className="num">{totals.demonstrations_validated}</div>
            <div className="lbl">Validated</div>
          </div>
          <div className="summary-cell">
            <div className="num">{totals.demonstrations_scored}</div>
            <div className="lbl">Scored</div>
          </div>
          <div className="summary-cell">
            <div className="num">{totals.capabilities_demonstrated}</div>
            <div className="lbl">Capabilities</div>
          </div>
        </div>

        {/* Agency Index */}
        {agency_index && (
          <>
            <h2>Agency Index</h2>
            <div className="agency-band">
              <div className="score">{agency_index.overall}</div>
              <div>
                <div style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {agency_index.level.replace(/_/g, ' ')}
                </div>
                <div style={{ fontSize: '11px', color: '#444', marginTop: '4px' }}>
                  Latest assessment: {formatDate(agency_index.assessed_at)}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Categories */}
        <h2>Evidence by Category</h2>
        {data.demonstrations_by_category.map((block) => (
          <div key={block.category_key} className="category-block">
            <div className="category-head">
              <h3>{block.category_label}</h3>
              <div className="stats">
                {block.count_submitted} submitted &middot; {block.count_validated} validated &middot;{' '}
                {block.count_scored} scored &middot; weighted total{' '}
                <strong>{block.total_weighted_score.toFixed(2)}</strong>
              </div>
            </div>
            {block.rows.length === 0 ? (
              <div className="empty">No demonstrations recorded in this category.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '40%' }}>Skill / Activity</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th>Raw</th>
                    <th>Weighted</th>
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.skill_name ?? '—'}</td>
                      <td>{r.status}</td>
                      <td>{formatDate(r.submitted_at)}</td>
                      <td>{r.raw_score ?? '—'}</td>
                      <td>{r.weighted_score ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}

        {/* Capabilities */}
        <h2>Capabilities Earned</h2>
        {data.capabilities.length === 0 ? (
          <div className="empty">No capabilities demonstrated yet.</div>
        ) : (
          <ul className="capabilities-list">
            {data.capabilities.map((c, idx) => (
              <li key={`${c.id ?? 'cap'}-${idx}`}>
                <strong>{c.name ?? 'Unnamed capability'}</strong>
                {c.category ? ` — ${c.category}` : ''}
                {c.level ? ` (${c.level})` : ''}
                {c.demonstrated_at ? ` · earned ${formatDate(c.demonstrated_at)}` : ''}
                {typeof c.score === 'number' ? ` · score ${c.score}` : ''}
              </li>
            ))}
          </ul>
        )}

        {/* Signature line */}
        <div className="signature">
          <div className="sig-block">
            Head of Department<br />
            <span style={{ color: '#777' }}>Signature & seal</span>
          </div>
          <div className="sig-block">
            Director, PDE<br />
            <span style={{ color: '#777' }}>Signature & seal</span>
          </div>
        </div>

        <div className="footer">
          This transcript is a NAAC/NBA-ready projection of the learner&apos;s PDE evidence as of{' '}
          {formatDateTime(generated_at)}. It draws from pde_demonstrations,
          pde_learner_capabilities, and pde_agency_index. Verify authenticity by re-running this
          transcript at <code>/pde/learn/transcript</code> with the learner&apos;s credentials.
        </div>
      </div>
    </>
  );
}
