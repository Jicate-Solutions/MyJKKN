'use client';

/**
 * Element Gallery (Phase 1)
 * A browsable dictionary of MyJKKN's UI elements. Each element is shown beside
 * five alternative designs (three on-brand, three bolder borrowed looks), with a
 * phone/computer preview toggle, plain-words search, category browsing, and a
 * per-user "favourite" vote saved in the browser.
 *
 * Phase 2 (separate PR) will swap the local vote for a shared `element_votes`
 * table + RLS so "everyone votes" counts across users, pull real data into the
 * examples, and expand the catalogue toward ~30 elements.
 *
 * Design: the shell mirrors MyJKKN's own Flat+Minimal look (theme tokens drive
 * the on-brand tiles, so light/dark follows the app automatically) precisely so
 * the varied element previews are the loud thing on the page.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Search, Heart, Monitor, Smartphone, Star } from 'lucide-react';

type VibeKey = 'current' | 'minimal' | 'soft' | 'neo' | 'glass' | 'material';
type Vibe = { key: VibeKey; label: string; tag: string; bold: boolean };

const VIBES: Vibe[] = [
  { key: 'current', label: 'Current', tag: 'MyJKKN', bold: false },
  { key: 'minimal', label: 'Minimal', tag: 'on-brand', bold: false },
  { key: 'soft', label: 'Soft', tag: 'on-brand', bold: false },
  { key: 'neo', label: 'Neobrutalist', tag: 'bold', bold: true },
  { key: 'glass', label: 'Glass', tag: 'bold', bold: true },
  { key: 'material', label: 'Material', tag: 'bold', bold: true },
];

type El = {
  id: string;
  name: string;
  cat: string;
  aka: string[];
  desc: string;
  where: string;
  body: ReactNode;
};

const CATS = ['All', 'Actions', 'Content', 'Navigation', 'Data', 'Forms', 'Feedback'];

// Element bodies. The vibe wrapper class (v-*) restyles these via scoped CSS.
const Btn = () => (
  <button className="dg-btn" type="button">
    <span aria-hidden>＋</span> Add student
  </button>
);
const Stat = () => (
  <div className="dg-card">
    <div className="dg-card-k">
      <span>Attendance</span>
      <span aria-hidden>📈</span>
    </div>
    <div className="dg-card-n">92%</div>
    <div className="dg-card-s">▲ 3% vs last week</div>
  </div>
);
const Tabbar = () => (
  <div className="dg-tabs" role="tablist" aria-label="sample tabs">
    <button className="dg-tab on">Overview</button>
    <button className="dg-tab">Attendance</button>
    <button className="dg-tab">Fees</button>
    <button className="dg-tab">Exams</button>
    <button className="dg-tab">Results</button>
  </div>
);
const Tbl = () => (
  <table className="dg-tbl">
    <thead>
      <tr>
        <th>Student</th>
        <th>Dept</th>
        <th>%</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <b>A. Priya</b>
        </td>
        <td>B.Sc CS</td>
        <td>96</td>
      </tr>
      <tr>
        <td>
          <b>R. Karthik</b>
        </td>
        <td>B.Com</td>
        <td>88</td>
      </tr>
      <tr>
        <td>
          <b>S. Fathima</b>
        </td>
        <td>BBA</td>
        <td>91</td>
      </tr>
    </tbody>
  </table>
);
const Field = () => (
  <div className="dg-field">
    <span className="dg-gl" aria-hidden>
      🔍
    </span>
    <input placeholder="Search students…" aria-label="sample search" />
  </div>
);
const Badges = () => (
  <div className="dg-badges">
    <span className="dg-badge ok">● Active</span>
    <span className="dg-badge wait">● Pending</span>
  </div>
);

const ELEMENTS: El[] = [
  {
    id: 'button',
    name: 'Button',
    cat: 'Actions',
    aka: ['Call-to-action', 'CTA', 'action button'],
    desc: 'The thing you press to make something happen — save, submit, add.',
    where: 'Every form, dialog and toolbar',
    body: <Btn />,
  },
  {
    id: 'card',
    name: 'Stat Card',
    cat: 'Content',
    aka: ['metric card', 'KPI tile', 'summary card'],
    desc: 'A little panel that shows one number that matters, with its trend.',
    where: 'Dashboards, reports, the home page',
    body: <Stat />,
  },
  {
    id: 'tabs',
    name: 'Tabs',
    cat: 'Navigation',
    aka: ['tab bar', 'segmented control', 'section switcher'],
    desc: 'A row of section names you switch between — the piece we made swipe-scroll on phones.',
    where: '~28 pages across billing, academics, OKR, admissions',
    body: <Tabbar />,
  },
  {
    id: 'table',
    name: 'Data Table',
    cat: 'Data',
    aka: ['grid', 'list view', 'records table'],
    desc: 'Rows and columns of records — students, bills, marks.',
    where: 'Learners, billing, attendance, exams',
    body: <Tbl />,
  },
  {
    id: 'field',
    name: 'Search Field',
    cat: 'Forms',
    aka: ['input', 'text box', 'search bar'],
    desc: 'Where you type to search or fill something in.',
    where: 'Top bar, every list and filter',
    body: <Field />,
  },
  {
    id: 'badge',
    name: 'Status Badge',
    cat: 'Feedback',
    aka: ['pill', 'chip', 'status tag', 'label'],
    desc: 'A small coloured tag that shows a state at a glance — active, pending, overdue.',
    where: 'Tables, cards, profiles, approvals',
    body: <Badges />,
  },
];

export default function DesignGalleryPage() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [phone, setPhone] = useState(false);
  const [voted, setVoted] = useState<Record<string, VibeKey>>({});

  // seed illustrative counts, then merge the user's saved votes from localStorage
  const [votes, setVotes] = useState<Record<string, Record<VibeKey, number>>>(() => {
    const seed: Record<string, Record<VibeKey, number>> = {};
    ELEMENTS.forEach((e) => {
      const base = [8, 5, 3, 11, 6, 4];
      const bump = e.name.length % 4;
      seed[e.id] = {} as Record<VibeKey, number>;
      VIBES.forEach((v, i) => {
        seed[e.id][v.key] = base[i] + bump;
      });
    });
    return seed;
  });

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return ELEMENTS.filter((e) => {
      if (cat !== 'All' && e.cat !== cat) return false;
      if (!needle) return true;
      return (e.name + ' ' + e.cat + ' ' + e.desc + ' ' + e.aka.join(' '))
        .toLowerCase()
        .includes(needle);
    });
  }, [q, cat]);

  function leader(id: string): VibeKey {
    let best: VibeKey = VIBES[0].key;
    let bv = -1;
    VIBES.forEach((v) => {
      if (votes[id][v.key] > bv) {
        bv = votes[id][v.key];
        best = v.key;
      }
    });
    return best;
  }

  function vote(id: string, key: VibeKey) {
    setVotes((prev) => {
      const next = { ...prev, [id]: { ...prev[id] } };
      const cur = voted[id];
      if (cur === key) {
        next[id][key] -= 1;
      } else {
        if (cur) next[id][cur] -= 1;
        next[id][key] += 1;
      }
      return next;
    });
    setVoted((prev) => {
      const next = { ...prev };
      if (next[id] === key) delete next[id];
      else next[id] = key;
      return next;
    });
  }

  return (
    <ContentLayout title="Element Gallery">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="dg">
        <header className="dg-title">
          <h1>Element Gallery</h1>
          <p>Every MyJKKN building block, beside five ways it could look — pick your favourite.</p>
        </header>
        {/* controls */}
        <div className="dg-controls">
          <label className="dg-search">
            <Search size={16} aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Describe it… “that swipey tab thing”"
              autoComplete="off"
            />
          </label>
          <div className="dg-seg" role="group" aria-label="Preview size">
            <button aria-pressed={!phone} onClick={() => setPhone(false)} type="button">
              <Monitor size={15} /> Computer
            </button>
            <button aria-pressed={phone} onClick={() => setPhone(true)} type="button">
              <Smartphone size={15} /> Phone
            </button>
          </div>
        </div>

        <p className="dg-lede">
          Each row is one MyJKKN element. The <b>first tile is what the site uses today</b>; the
          other five are alternatives — three that stay on-brand, three that borrow bolder looks.
          Flip any preview to phone size, and heart the version you like best.
        </p>
        <p className="dg-note">
          🧪 <b>Phase 1 preview.</b> 6 sample elements (the full one will reach ~30). Votes are
          illustrative and reset on refresh — shared voting across everyone lands in Phase 2.
        </p>

        {/* categories */}
        <nav className="dg-chips" aria-label="Filter by category">
          {CATS.map((c) => (
            <button
              key={c}
              className="dg-chip"
              aria-pressed={cat === c}
              onClick={() => setCat(c)}
              type="button"
            >
              {c}
            </button>
          ))}
        </nav>

        <div className="dg-count">
          {list.length} {list.length === 1 ? 'element' : 'elements'}
          {cat !== 'All' ? ` in ${cat}` : ''}
          {q.trim() ? ` matching “${q.trim()}”` : ''}
        </div>

        {list.length === 0 ? (
          <div className="dg-empty">
            No element matches that. Try “tab”, “card”, “pill”, or clear the search.
          </div>
        ) : (
          <div className={'dg-stage' + (phone ? ' phone' : '')}>
            {list.map((e) => {
              const lead = leader(e.id);
              return (
                <section className="dg-el" key={e.id}>
                  <div className="dg-el-head">
                    <h2>{e.name}</h2>
                    <span className="dg-el-cat">{e.cat}</span>
                    <span className="dg-el-aka">
                      also called{' '}
                      {e.aka.map((a, i) => (
                        <span key={a}>
                          {i > 0 ? ', ' : ''}
                          <code>{a}</code>
                        </span>
                      ))}
                    </span>
                  </div>
                  <p className="dg-el-desc">{e.desc}</p>
                  <div className="dg-el-where">
                    <b>Where:</b> {e.where}
                  </div>
                  <div className="dg-tiles">
                    {VIBES.map((v) => {
                      const isLead = v.key === lead;
                      const isVoted = voted[e.id] === v.key;
                      return (
                        <div
                          key={v.key}
                          className={'dg-tile v-' + v.key + (isLead ? ' leader' : '')}
                        >
                          {isLead && (
                            <div className="dg-ribbon">
                              <Star size={11} /> Most voted
                            </div>
                          )}
                          <div className="dg-prev">
                            <div className="dg-prev-in">{e.body}</div>
                          </div>
                          <div className="dg-foot">
                            <span className="dg-vlabel">
                              {v.label}
                              <em className={v.bold ? 'bold' : 'on'}>{v.tag}</em>
                            </span>
                            <button
                              className={'dg-vote' + (isVoted ? ' voted' : '')}
                              onClick={() => vote(e.id, v.key)}
                              type="button"
                              aria-label={'Vote for ' + v.label}
                              aria-pressed={isVoted}
                            >
                              <Heart size={13} fill={isVoted ? 'currentColor' : 'none'} />
                              <b>{votes[e.id][v.key]}</b>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <footer className="dg-footer">
          Current style detected from the codebase: <b>shadcn “new-york” · Flat + Minimal</b>, deep
          green accent <code>hsl(150 78% 26%)</code>, Poppins. On-brand alternatives keep that; bold
          ones borrow from Neobrutalism, Glassmorphism and Material.
        </footer>
      </div>
    </ContentLayout>
  );
}

/* Scoped styles. `.dg` maps MyJKKN theme tokens into the prototype's palette so
   the on-brand tiles follow the app's light/dark automatically; bold vibes keep
   their own fixed looks. */
const CSS = `
.dg{
  --paper:hsl(var(--card));--ground:hsl(var(--background));--card:hsl(var(--card));
  --ink:hsl(var(--foreground));--soft-ink:hsl(var(--muted-foreground));--faint-ink:hsl(var(--muted-foreground));
  --line:hsl(var(--border));--jkkn:hsl(var(--primary));--jkkn-fg:hsl(var(--primary-foreground));
  --jkkn-soft:hsl(var(--primary) / 0.10);--jkkn-ink:hsl(var(--primary));
  --good:hsl(var(--primary));--warn:#b9760a;
  color:var(--ink);
}
.dg *{box-sizing:border-box}
.dg-title{margin:0 0 18px}
.dg-title h1{font-size:clamp(24px,3.4vw,32px);margin:0 0 6px;letter-spacing:-.025em;text-wrap:balance}
.dg-title p{margin:0;color:var(--soft-ink);font-size:15px;max-width:70ch}
.dg-controls{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:14px}
.dg-search{display:flex;align-items:center;gap:8px;background:var(--paper);border:1px solid var(--line);border-radius:11px;padding:9px 12px;flex:1 1 260px;min-width:200px}
.dg-search svg{color:var(--soft-ink);flex:0 0 auto}
.dg-search input{border:0;outline:0;background:transparent;color:var(--ink);font:inherit;width:100%}
.dg-seg{display:inline-flex;background:var(--paper);border:1px solid var(--line);border-radius:11px;padding:3px;gap:2px}
.dg-seg button{border:0;background:transparent;color:var(--soft-ink);font:inherit;font-weight:600;font-size:13px;padding:7px 12px;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:6px}
.dg-seg button[aria-pressed="true"]{background:var(--jkkn);color:var(--jkkn-fg)}
.dg-lede{color:var(--soft-ink);max-width:78ch;margin:4px 0 8px;font-size:15px}
.dg-note{display:inline-flex;gap:8px;align-items:center;font-size:12.5px;color:var(--soft-ink);background:var(--jkkn-soft);border:1px solid hsl(var(--primary) / 0.22);padding:7px 12px;border-radius:999px;margin:0 0 6px}
.dg-note b{color:var(--jkkn-ink)}
.dg-chips{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 6px}
.dg-chip{border:1px solid var(--line);background:var(--paper);color:var(--soft-ink);font:inherit;font-weight:600;font-size:13px;padding:8px 14px;border-radius:999px;cursor:pointer}
.dg-chip[aria-pressed="true"]{background:var(--ink);color:var(--ground);border-color:var(--ink)}
.dg-count{margin:14px 0 4px;font-size:13px;color:var(--faint-ink);font-variant-numeric:tabular-nums}
.dg-empty{padding:56px 0;text-align:center;color:var(--faint-ink)}
.dg-el{padding:24px 0;border-top:1px solid var(--line)}
.dg-el-head{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:baseline;margin-bottom:4px}
.dg-el-head h2{font-size:21px;margin:0;letter-spacing:-.02em}
.dg-el-cat{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--jkkn);background:var(--jkkn-soft);padding:3px 8px;border-radius:6px}
.dg-el-aka{font-size:13px;color:var(--faint-ink)}
.dg-el-aka code{font-family:ui-monospace,monospace;font-size:12px}
.dg-el-desc{margin:6px 0 2px;color:var(--soft-ink);max-width:78ch}
.dg-el-where{font-size:12.5px;color:var(--faint-ink)}
.dg-el-where b{color:var(--soft-ink);font-weight:600}
.dg-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(258px,1fr));gap:14px;margin-top:16px}
.dg-stage.phone .dg-tiles{grid-template-columns:repeat(auto-fill,minmax(212px,1fr))}
.dg-tile{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--card);display:flex;flex-direction:column;position:relative}
.dg-tile.leader{outline:2px solid var(--jkkn);outline-offset:-2px}
.dg-ribbon{position:absolute;top:10px;right:-1px;background:var(--jkkn);color:var(--jkkn-fg);font-size:10.5px;font-weight:700;padding:3px 9px 3px 8px;border-radius:6px 0 0 6px;z-index:3;display:flex;gap:4px;align-items:center}
.dg-prev{--prev-bg:var(--card);background:var(--prev-bg);min-height:132px;display:grid;place-items:center;padding:20px 16px}
.dg-prev-in{width:100%;display:flex;justify-content:center}
.dg-stage.phone .dg-prev-in{max-width:210px}
.dg-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 11px;border-top:1px solid var(--line);background:var(--card)}
.dg-vlabel{font-size:12px;font-weight:600;color:var(--ink);display:flex;flex-direction:column;line-height:1.25}
.dg-vlabel em{font-style:normal;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.dg-vlabel em.on{color:var(--jkkn)}.dg-vlabel em.bold{color:var(--warn)}
.dg-vote{border:1px solid var(--line);background:var(--paper);color:var(--soft-ink);font:inherit;font-weight:600;font-size:12.5px;border-radius:999px;padding:6px 11px;cursor:pointer;display:flex;gap:6px;align-items:center;font-variant-numeric:tabular-nums}
.dg-vote.voted{background:var(--jkkn);border-color:var(--jkkn);color:var(--jkkn-fg)}

/* per-vibe preview backdrops */
.v-soft .dg-prev{--prev-bg:var(--jkkn-soft)}
.v-neo .dg-prev{--prev-bg:#f3f2ec}
.v-glass .dg-prev{--prev-bg:linear-gradient(135deg,#5b7cff 0%,#22c08a 55%,#ffb057 100%)}
.v-material .dg-prev{--prev-bg:#f4f5f7}

/* BUTTON */
.dg-btn{font:600 14px/1 inherit;padding:11px 18px;border-radius:10px;border:1px solid transparent;background:var(--jkkn);color:var(--jkkn-fg);cursor:pointer;display:inline-flex;gap:8px;align-items:center}
.v-current .dg-btn{border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.12)}
.v-minimal .dg-btn{background:transparent;color:var(--jkkn);border:0;border-bottom:2px solid var(--jkkn);border-radius:0;padding:9px 4px}
.v-soft .dg-btn{border-radius:999px;padding:12px 22px;box-shadow:0 8px 18px hsl(var(--primary) / 0.28)}
.v-neo .dg-btn{background:#0bd67a;color:#08130c;border:2.5px solid #111;border-radius:3px;box-shadow:4px 4px 0 #111;font-weight:800}
.v-glass .dg-btn{background:rgba(255,255,255,.22);border:1px solid rgba(255,255,255,.5);color:#fff;border-radius:12px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);text-shadow:0 1px 2px rgba(0,0,0,.25)}
.v-material .dg-btn{background:#00695c;color:#fff;border-radius:4px;text-transform:uppercase;letter-spacing:.06em;font-size:13px;box-shadow:0 2px 5px rgba(0,0,0,.28),0 1px 2px rgba(0,0,0,.2)}

/* STAT CARD */
.dg-card{width:100%;max-width:210px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:15px 16px;color:var(--ink)}
.dg-card-k{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--soft-ink);font-weight:600}
.dg-card-n{font-size:30px;font-weight:800;letter-spacing:-.02em;margin:6px 0 2px;font-variant-numeric:tabular-nums}
.dg-card-s{font-size:11.5px;color:var(--good);font-weight:600}
.v-current .dg-card{border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,.05)}
.v-minimal .dg-card{border:0;border-left:3px solid var(--jkkn);border-radius:0;padding-left:13px;background:transparent}
.v-soft .dg-card{border:0;border-radius:20px;background:var(--card);box-shadow:0 10px 26px hsl(var(--primary) / 0.16)}
.v-neo .dg-card{border:2.5px solid #111;border-radius:4px;box-shadow:5px 5px 0 #111;background:#fff;color:#111}
.v-neo .dg-card-k{color:#333}.v-neo .dg-card-s{color:#0a7d47}
.v-glass .dg-card{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.45);border-radius:16px;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:#fff}
.v-glass .dg-card-k{color:rgba(255,255,255,.85)}.v-glass .dg-card-s{color:#d6ffe9}
.v-material .dg-card{background:#fff;border:0;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,.16),0 1px 3px rgba(0,0,0,.12);color:#1c2a24}
.v-material .dg-card-k{color:#5f6b65}

/* TABS */
.dg-tabs{display:flex;gap:2px;background:var(--jkkn-soft);padding:4px;border-radius:10px;max-width:100%;overflow-x:auto;scrollbar-width:none}
.dg-tabs::-webkit-scrollbar{display:none}
.dg-tab{white-space:nowrap;border:0;background:transparent;color:var(--soft-ink);font:600 12.5px inherit;padding:8px 13px;border-radius:7px;cursor:pointer}
.dg-tab.on{background:var(--jkkn);color:var(--jkkn-fg)}
.v-minimal .dg-tabs{background:transparent;gap:16px;padding:0 0 2px;border-bottom:1px solid var(--line);border-radius:0}
.v-minimal .dg-tab{padding:6px 0;border-radius:0;color:var(--faint-ink)}
.v-minimal .dg-tab.on{background:transparent;color:var(--jkkn);border-bottom:2px solid var(--jkkn)}
.v-soft .dg-tabs{background:var(--card);border-radius:999px;box-shadow:0 8px 20px hsl(var(--primary) / 0.14)}
.v-soft .dg-tab.on{border-radius:999px}
.v-neo .dg-tabs{background:#fff;border:2.5px solid #111;border-radius:4px;box-shadow:4px 4px 0 #111;padding:4px}
.v-neo .dg-tab{color:#222;font-weight:800}.v-neo .dg-tab.on{background:#0bd67a;color:#08130c;border-radius:2px}
.v-glass .dg-tabs{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.4);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-radius:14px}
.v-glass .dg-tab{color:rgba(255,255,255,.82)}.v-glass .dg-tab.on{background:rgba(255,255,255,.28);color:#fff}
.v-material .dg-tabs{background:transparent;gap:4px;padding:0;border-bottom:2px solid #e0e3e0;border-radius:0}
.v-material .dg-tab{text-transform:uppercase;letter-spacing:.05em;font-size:11.5px;color:#5f6b65;padding:10px 12px;border-radius:0}
.v-material .dg-tab.on{background:transparent;color:#00695c;box-shadow:inset 0 -3px 0 #00695c}

/* TABLE */
.dg-tbl{width:100%;max-width:230px;border-collapse:collapse;font-size:12px;background:var(--card);border-radius:10px;overflow:hidden;border:1px solid var(--line);color:var(--ink)}
.dg-tbl th,.dg-tbl td{padding:7px 9px;text-align:left}
.dg-tbl th{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--faint-ink);background:var(--jkkn-soft)}
.dg-tbl tr+tr td{border-top:1px solid var(--line)}
.v-minimal .dg-tbl{border:0;border-radius:0}.v-minimal .dg-tbl th{background:transparent;border-bottom:1.5px solid var(--jkkn)}
.v-soft .dg-tbl{border:0;border-radius:16px;box-shadow:0 10px 24px hsl(var(--primary) / 0.14);background:var(--card)}
.v-soft .dg-tbl th{background:transparent;color:var(--jkkn-ink)}
.v-neo .dg-tbl{border:2.5px solid #111;border-radius:4px;box-shadow:4px 4px 0 #111;background:#fff;color:#111}
.v-neo .dg-tbl th{background:#0bd67a;color:#08130c}.v-neo .dg-tbl tr+tr td{border-top:2px solid #111}
.v-glass .dg-tbl{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.4);color:#fff;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.v-glass .dg-tbl th{background:rgba(255,255,255,.16);color:#eafff4}.v-glass .dg-tbl tr+tr td{border-top:1px solid rgba(255,255,255,.25)}
.v-material .dg-tbl{border:0;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,.14);background:#fff;color:#1c2a24}
.v-material .dg-tbl th{background:#fff;color:#5f6b65;border-bottom:1px solid #e0e3e0}

/* SEARCH FIELD */
.dg-field{display:flex;align-items:center;gap:9px;width:100%;max-width:220px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:11px 13px;color:var(--ink)}
.dg-gl{color:var(--soft-ink)}
.dg-field input{border:0;outline:0;background:transparent;font:inherit;font-size:13px;color:var(--ink);width:100%}
.v-minimal .dg-field{border:0;border-bottom:1.5px solid var(--line);border-radius:0;padding:9px 2px;background:transparent}
.v-soft .dg-field{border:0;border-radius:999px;background:var(--jkkn-soft)}
.v-neo .dg-field{border:2.5px solid #111;border-radius:3px;box-shadow:4px 4px 0 #111;background:#fff;color:#111}
.v-neo .dg-field input,.v-neo .dg-gl{color:#111}
.v-glass .dg-field{background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.5);border-radius:12px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#fff}
.v-glass .dg-field input,.v-glass .dg-gl{color:#fff}.v-glass .dg-field input::placeholder{color:rgba(255,255,255,.75)}
.v-material .dg-field{border:0;border-bottom:2px solid #00695c;border-radius:6px 6px 0 0;background:#eceff1;color:#1c2a24}

/* BADGE */
.dg-badges{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.dg-badge{font-size:11.5px;font-weight:700;padding:5px 11px;border-radius:999px;display:inline-flex;gap:5px;align-items:center}
.dg-badge.ok{background:var(--jkkn-soft);color:var(--jkkn-ink)}
.dg-badge.wait{background:#fbf0dc;color:#8a5a06}
.v-minimal .dg-badge{background:transparent;border-radius:0;padding:3px 0;border-bottom:2px solid currentColor}
.v-minimal .dg-badge.ok{color:var(--jkkn)}.v-minimal .dg-badge.wait{color:var(--warn)}
.v-soft .dg-badge{border-radius:999px;padding:6px 14px}.v-soft .dg-badge.ok{box-shadow:0 4px 12px hsl(var(--primary) / 0.2)}
.v-neo .dg-badge{border:2px solid #111;border-radius:3px;box-shadow:2px 2px 0 #111;background:#0bd67a;color:#08130c}
.v-neo .dg-badge.wait{background:#ffd23f}
.v-glass .dg-badge{background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.5);color:#fff;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.v-material .dg-badge{border-radius:4px;padding:5px 10px;text-transform:uppercase;letter-spacing:.04em;font-size:10.5px}
.v-material .dg-badge.ok{background:#00695c;color:#fff}.v-material .dg-badge.wait{background:#e65100;color:#fff}

.dg-footer{margin-top:36px;padding-top:18px;border-top:1px solid var(--line);color:var(--faint-ink);font-size:12.5px}
.dg-footer code{font-family:ui-monospace,monospace;font-size:11.5px}
@media (prefers-reduced-motion:reduce){.dg *{transition:none!important}}
`;
