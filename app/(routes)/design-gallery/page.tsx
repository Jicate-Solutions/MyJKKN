'use client';

/**
 * Element Gallery (Phase 1)
 * A browsable dictionary of MyJKKN's UI elements. Each element is shown beside
 * five alternative designs (three on-brand, three bolder borrowed looks), with a
 * phone/computer preview toggle, plain-words search, category browsing, and a
 * per-user "favourite" vote saved in the browser.
 *
 * Phase 2 (separate PR) will swap the local vote for a shared `element_votes`
 * table + RLS so "everyone votes" counts across users, and pull real data into
 * the examples. Phase 1 now ships 30 elements, each in seven looks.
 *
 * Design: the shell mirrors MyJKKN's own Flat+Minimal look (theme tokens drive
 * the on-brand tiles, so light/dark follows the app automatically) precisely so
 * the varied element previews are the loud thing on the page.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Search, Heart, Monitor, Smartphone, Star } from 'lucide-react';

type VibeKey = 'current' | 'minimal' | 'soft' | 'neo' | 'glass' | 'liquid' | 'material';
type Vibe = { key: VibeKey; label: string; tag: string; bold: boolean };

const VIBES: Vibe[] = [
  { key: 'current', label: 'Current', tag: 'MyJKKN', bold: false },
  { key: 'minimal', label: 'Minimal', tag: 'on-brand', bold: false },
  { key: 'soft', label: 'Soft', tag: 'on-brand', bold: false },
  { key: 'neo', label: 'Neobrutalist', tag: 'bold', bold: true },
  { key: 'glass', label: 'Glass', tag: 'bold', bold: true },
  { key: 'liquid', label: 'Liquid Glass', tag: 'bold', bold: true },
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
    <span aria-hidden>＋</span> Add learner
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
        <th>Learner</th>
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
    <input placeholder="Search learners…" aria-label="sample search" />
  </div>
);
const Badges = () => (
  <div className="dg-badges">
    <span className="dg-badge ok">● Active</span>
    <span className="dg-badge wait">● Pending</span>
  </div>
);

// ── Phase-1 expansion elements (read the per-vibe --v-* tokens) ──────────────
const Toggle = () => (
  <div className="dg-row2">
    <span className="dg-switch on" role="switch" aria-checked="true" aria-label="on">
      <i />
    </span>
    <span className="dg-switch" role="switch" aria-checked="false" aria-label="off">
      <i />
    </span>
  </div>
);
const Check = () => (
  <div className="dg-col2">
    <label className="dg-check">
      <span className="dg-box on" aria-hidden>
        ✓
      </span>{' '}
      Email alerts
    </label>
    <label className="dg-check">
      <span className="dg-box" aria-hidden /> SMS alerts
    </label>
  </div>
);
const Radios = () => (
  <div className="dg-col2" role="radiogroup" aria-label="sample">
    <label className="dg-radio on">
      <span className="dg-dot" aria-hidden /> Day scholar
    </label>
    <label className="dg-radio">
      <span className="dg-dot" aria-hidden /> Hosteller
    </label>
  </div>
);
const Select = () => (
  <div className="dg-select">
    <span>B.Sc Computer Science</span>
    <span className="dg-caret" aria-hidden>
      ▾
    </span>
  </div>
);
const Progress = () => (
  <div className="dg-prog-wrap">
    <div className="dg-prog">
      <i style={{ width: '68%' }} />
    </div>
    <span className="dg-prog-n">68%</span>
  </div>
);
const Avatars = () => (
  <div className="dg-avs">
    <span className="dg-av">AP</span>
    <span className="dg-av g2">RK</span>
    <span className="dg-av g3">SF</span>
    <span className="dg-av more">+9</span>
  </div>
);
const Alert = () => (
  <div className="dg-alert dg-surface">
    <span className="dg-alert-i" aria-hidden>
      ✓
    </span>
    <div className="dg-alert-t">
      <b>Fees received</b>
      <span>Term 2 payment confirmed.</span>
    </div>
  </div>
);
const Crumb = () => (
  <nav className="dg-crumb" aria-label="Breadcrumb">
    <a>Home</a>
    <span aria-hidden>/</span>
    <a>Learners</a>
    <span aria-hidden>/</span>
    <b>Profile</b>
  </nav>
);
const Pager = () => (
  <div className="dg-pager">
    <button type="button" aria-label="Previous">
      ‹
    </button>
    <button type="button">1</button>
    <button type="button" className="on" aria-current="page">
      2
    </button>
    <button type="button">3</button>
    <span className="dg-pager-x">…</span>
    <button type="button">9</button>
    <button type="button" aria-label="Next">
      ›
    </button>
  </div>
);
const Tip = () => (
  <div className="dg-tipwrap">
    <span className="dg-tipbtn">Marks</span>
    <span className="dg-tip">Out of 100</span>
  </div>
);
const Accordion = () => (
  <div className="dg-acc dg-surface">
    <div className="dg-acc-h on">
      <span>Attendance policy</span>
      <span aria-hidden>▾</span>
    </div>
    <div className="dg-acc-b">A learner needs 75% to sit the exam.</div>
    <div className="dg-acc-h">
      <span>Fee schedule</span>
      <span aria-hidden>▸</span>
    </div>
  </div>
);
const Slider = () => (
  <div className="dg-slider">
    <div className="dg-slider-t">
      <i style={{ width: '55%' }} />
      <span className="dg-thumb" style={{ left: '55%' }} />
    </div>
  </div>
);
const DatePick = () => (
  <div className="dg-cal dg-surface">
    <div className="dg-cal-h">
      <span aria-hidden>‹</span>
      <b>July 2026</b>
      <span aria-hidden>›</span>
    </div>
    <div className="dg-cal-g">
      {[14, 15, 16, 17, 18, 19, 20].map((d) => (
        <span key={d} className={'dg-cal-d' + (d === 18 ? ' on' : '')}>
          {d}
        </span>
      ))}
    </div>
  </div>
);
const Empty = () => (
  <div className="dg-empty2">
    <span className="dg-empty-i" aria-hidden>
      🗂️
    </span>
    <b>No records yet</b>
    <span>Add your first entry to get started.</span>
    <button className="dg-btn" type="button">
      Add record
    </button>
  </div>
);
const Skeleton = () => (
  <div className="dg-skel dg-surface" aria-hidden>
    <span className="dg-sk-av" />
    <div className="dg-sk-lines">
      <span className="dg-sk-l w70" />
      <span className="dg-sk-l w45" />
    </div>
  </div>
);
const Modal = () => (
  <div className="dg-modal dg-surface">
    <b>Delete record?</b>
    <span>This can’t be undone.</span>
    <div className="dg-modal-a">
      <button className="dg-btn ghost" type="button">
        Cancel
      </button>
      <button className="dg-btn" type="button">
        Delete
      </button>
    </div>
  </div>
);
const Toast = () => (
  <div className="dg-toast dg-surface">
    <span className="dg-toast-i" aria-hidden>
      ✓
    </span>
    <span className="dg-toast-t">Saved changes</span>
    <button type="button" aria-label="Dismiss">
      ×
    </button>
  </div>
);
const SideItem = () => (
  <div className="dg-side">
    <div className="dg-side-i on">
      <span aria-hidden>▦</span> Dashboard
    </div>
    <div className="dg-side-i">
      <span aria-hidden>◷</span> Attendance
    </div>
    <div className="dg-side-i">
      <span aria-hidden>₹</span> Fees
    </div>
  </div>
);
const Stepper = () => (
  <div className="dg-steps">
    <span className="dg-step done">1</span>
    <i className="dg-step-l done" />
    <span className="dg-step on">2</span>
    <i className="dg-step-l" />
    <span className="dg-step">3</span>
  </div>
);
const Upload = () => (
  <div className="dg-upload">
    <span className="dg-upload-i" aria-hidden>
      ⬆
    </span>
    <b>Drop a file</b>
    <span>or click to browse</span>
  </div>
);
const Rating = () => (
  <div className="dg-rate" aria-label="4 out of 5">
    <span className="on">★</span>
    <span className="on">★</span>
    <span className="on">★</span>
    <span className="on">★</span>
    <span>★</span>
  </div>
);
const Chips = () => (
  <div className="dg-chipin dg-surface">
    <span className="dg-chip2">
      B.Sc CS <b aria-hidden>×</b>
    </span>
    <span className="dg-chip2">
      Final year <b aria-hidden>×</b>
    </span>
    <span className="dg-chipph">add…</span>
  </div>
);
const Segmented = () => (
  <div className="dg-seg2" role="tablist" aria-label="range">
    <button type="button" className="on">
      Day
    </button>
    <button type="button">Week</button>
    <button type="button">Month</button>
  </div>
);
const Kpi = () => (
  <div className="dg-kpi dg-surface">
    <span className="dg-kpi-k">Collections</span>
    <div className="dg-kpi-row">
      <span className="dg-kpi-n">₹4.2 Cr</span>
      <span className="dg-kpi-d up">▲ 12%</span>
    </div>
    <svg className="dg-kpi-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden>
      <polyline points="0,22 18,18 34,20 52,10 70,12 86,5 100,7" />
    </svg>
  </div>
);
const Timeline = () => (
  <div className="dg-tl">
    <div className="dg-tl-i">
      <span className="dg-tl-dot on" />
      <div className="dg-tl-t">
        <b>Enrolled</b>
        <span>2m ago</span>
      </div>
    </div>
    <div className="dg-tl-i">
      <span className="dg-tl-dot" />
      <div className="dg-tl-t">
        <b>Fee paid</b>
        <span>1h ago</span>
      </div>
    </div>
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
    desc: 'Rows and columns of records — learners, bills, marks.',
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
  {
    id: 'toggle',
    name: 'Toggle',
    cat: 'Forms',
    aka: ['switch', 'on/off', 'that on off thing', 'slider switch'],
    desc: 'A little sliding switch you flip on or off — like a light switch.',
    where: 'Settings, notification preferences, feature flags',
    body: <Toggle />,
  },
  {
    id: 'checkbox',
    name: 'Checkbox',
    cat: 'Forms',
    aka: ['tick box', 'check', 'multi-select'],
    desc: 'A box you tick to say “yes, this one” — you can pick several.',
    where: 'Filters, consent, bulk-select rows',
    body: <Check />,
  },
  {
    id: 'radio',
    name: 'Radio Buttons',
    cat: 'Forms',
    aka: ['option button', 'pick one', 'single choice'],
    desc: 'A set of circles where you can pick exactly one.',
    where: 'Forms, gender, day-scholar vs hosteller',
    body: <Radios />,
  },
  {
    id: 'select',
    name: 'Dropdown',
    cat: 'Forms',
    aka: ['select', 'picker', 'combo box', 'that list that drops down'],
    desc: 'A closed box that opens a list to choose from.',
    where: 'Department, program and year pickers everywhere',
    body: <Select />,
  },
  {
    id: 'progress',
    name: 'Progress Bar',
    cat: 'Feedback',
    aka: ['loading bar', 'completion bar', 'percent bar'],
    desc: 'A bar that fills up to show how far along something is.',
    where: 'Uploads, imports, profile completion, course progress',
    body: <Progress />,
  },
  {
    id: 'avatar',
    name: 'Avatar',
    cat: 'Content',
    aka: ['profile picture', 'initials circle', 'user photo'],
    desc: 'The little round picture or initials that stands for a person.',
    where: 'Top bar, comments, member lists, approvals',
    body: <Avatars />,
  },
  {
    id: 'alert',
    name: 'Alert',
    cat: 'Feedback',
    aka: ['callout', 'banner', 'message box', 'notice'],
    desc: 'A coloured box that tells you something happened — success, warning, error.',
    where: 'After saving, form errors, page-level notices',
    body: <Alert />,
  },
  {
    id: 'breadcrumb',
    name: 'Breadcrumb',
    cat: 'Navigation',
    aka: ['trail', 'path', 'where am I'],
    desc: 'The little trail of links showing where you are and how to go back.',
    where: 'Deep pages — profiles, records, nested settings',
    body: <Crumb />,
  },
  {
    id: 'pagination',
    name: 'Pagination',
    cat: 'Navigation',
    aka: ['page numbers', 'pager', 'next/previous'],
    desc: 'The row of page numbers for stepping through a long list.',
    where: 'Every long table — learners, bills, applications',
    body: <Pager />,
  },
  {
    id: 'tooltip',
    name: 'Tooltip',
    cat: 'Feedback',
    aka: ['hint', 'hover bubble', 'that little popup'],
    desc: 'A tiny bubble of help that appears when you hover over something.',
    where: 'Icon buttons, abbreviations, tricky fields',
    body: <Tip />,
  },
  {
    id: 'accordion',
    name: 'Accordion',
    cat: 'Content',
    aka: ['expander', 'collapsible', 'FAQ', 'show/hide'],
    desc: 'A stack of headings you tap to open and reveal what’s inside.',
    where: 'FAQs, long forms, policy pages, settings groups',
    body: <Accordion />,
  },
  {
    id: 'slider',
    name: 'Slider',
    cat: 'Forms',
    aka: ['range', 'drag to set', 'volume-style control'],
    desc: 'A track with a knob you drag to pick a value in a range.',
    where: 'Filters by amount, marks range, zoom',
    body: <Slider />,
  },
  {
    id: 'datepicker',
    name: 'Date Picker',
    cat: 'Forms',
    aka: ['calendar', 'pick a date', 'date field'],
    desc: 'A little calendar for choosing a day.',
    where: 'Admissions, fee due dates, event scheduling',
    body: <DatePick />,
  },
  {
    id: 'empty',
    name: 'Empty State',
    cat: 'Feedback',
    aka: ['nothing here', 'blank slate', 'no data'],
    desc: 'The friendly “nothing here yet” screen with a next step.',
    where: 'New lists, cleared searches, fresh dashboards',
    body: <Empty />,
  },
  {
    id: 'skeleton',
    name: 'Loading Skeleton',
    cat: 'Feedback',
    aka: ['placeholder', 'shimmer', 'loading blocks'],
    desc: 'Grey shimmering blocks shown while the real content loads.',
    where: 'Tables, cards and profiles while data arrives',
    body: <Skeleton />,
  },
  {
    id: 'modal',
    name: 'Dialog',
    cat: 'Feedback',
    aka: ['modal', 'popup', 'confirm box', 'that box that blocks the page'],
    desc: 'A focused box that floats over the page to confirm or collect something.',
    where: 'Delete confirms, quick forms, previews',
    body: <Modal />,
  },
  {
    id: 'toast',
    name: 'Toast',
    cat: 'Feedback',
    aka: ['snackbar', 'notification', 'that little message that pops and fades'],
    desc: 'A small message that slides in to confirm an action, then fades.',
    where: 'After save, copy, send — all over the app',
    body: <Toast />,
  },
  {
    id: 'sidebar',
    name: 'Sidebar Item',
    cat: 'Navigation',
    aka: ['nav item', 'menu row', 'left menu link'],
    desc: 'A single row in the left menu — icon, label, and a highlight when active.',
    where: 'The left navigation on every page',
    body: <SideItem />,
  },
  {
    id: 'stepper',
    name: 'Stepper',
    cat: 'Navigation',
    aka: ['wizard', 'steps', 'progress dots', '1-2-3'],
    desc: 'Numbered steps that show how far through a multi-step flow you are.',
    where: 'Admissions, onboarding, multi-page forms',
    body: <Stepper />,
  },
  {
    id: 'upload',
    name: 'File Upload',
    cat: 'Forms',
    aka: ['dropzone', 'attach file', 'drag and drop'],
    desc: 'A box you drop a file onto (or click to browse).',
    where: 'Documents, photos, bulk imports',
    body: <Upload />,
  },
  {
    id: 'rating',
    name: 'Rating',
    cat: 'Feedback',
    aka: ['stars', 'score', 'feedback stars'],
    desc: 'A row of stars you tap to give a score.',
    where: 'Feedback forms, course reviews, surveys',
    body: <Rating />,
  },
  {
    id: 'chips',
    name: 'Tag Input',
    cat: 'Forms',
    aka: ['chips', 'tags', 'pills you type', 'multi-add'],
    desc: 'Little removable pills for things you’ve added, plus a spot to type more.',
    where: 'Filters, skills, tagging records',
    body: <Chips />,
  },
  {
    id: 'segmented',
    name: 'Segmented Control',
    cat: 'Navigation',
    aka: ['toggle group', 'button group', 'day/week/month'],
    desc: 'A joined set of buttons where one is always chosen — like Day / Week / Month.',
    where: 'Chart ranges, view switches, filters',
    body: <Segmented />,
  },
  {
    id: 'kpi',
    name: 'KPI Trend',
    cat: 'Content',
    aka: ['metric with sparkline', 'trend tile', 'number with mini chart'],
    desc: 'A big number with its change and a tiny line showing the trend.',
    where: 'Dashboards, reports, finance summaries',
    body: <Kpi />,
  },
  {
    id: 'timeline',
    name: 'Timeline',
    cat: 'Content',
    aka: ['activity feed', 'history', 'log', 'what happened'],
    desc: 'A vertical thread of events with dots, newest first.',
    where: 'Activity logs, application history, audit trails',
    body: <Timeline />,
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
      const base = [8, 5, 3, 11, 6, 7, 4];
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
          <p>Every MyJKKN building block, beside six ways it could look — pick your favourite.</p>
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
          other six are alternatives — two that stay on-brand (now carrying the JKKN gold + cream),
          and four bolder borrowed looks, including two takes on glass. Flip any preview to phone
          size, and heart the version you like best.
        </p>
        <p className="dg-note">
          🧪 <b>Phase 1 preview.</b> 30 elements, each shown seven ways. Votes are illustrative and
          reset on refresh — shared voting across everyone lands in Phase 2.
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
          green <code>#0b6d41</code> with the JKKN gold <code>#ffde59</code> and cream{' '}
          <code>#fbfbee</code>, Poppins. On-brand alternatives keep the brand palette; bold ones
          borrow from Neobrutalism, Glassmorphism, Liquid Glass and Material.
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
  --jkkn-green:#0b6d41;--jkkn-gold:#ffde59;--jkkn-gold-ink:#7a5a06;--jkkn-cream:#fbfbee;--jkkn-cream-line:#e7e0bf;
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
.v-soft .dg-prev{--prev-bg:var(--jkkn-cream)}
.v-neo .dg-prev{--prev-bg:#f3f2ec}
.v-glass .dg-prev{--prev-bg:linear-gradient(135deg,#5b7cff 0%,#22c08a 55%,#ffb057 100%)}
.v-liquid .dg-prev{--prev-bg:linear-gradient(160deg,#eaf3ff 0%,#dbeafe 32%,#e9dcff 66%,#ffe6f0 100%)}
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

/* ============================================================
   LIQUID GLASS · 7th vibe (Apple signature — frosted white, blue)
   ============================================================ */
.v-liquid .dg-btn{background:linear-gradient(160deg,#5b8cff,#2b6cff);color:#fff;border:1px solid rgba(255,255,255,.6);border-radius:16px;box-shadow:0 8px 20px rgba(43,108,255,.35),inset 0 1px 0 rgba(255,255,255,.55);text-shadow:0 1px 1px rgba(20,40,90,.3)}
.v-liquid .dg-card{background:rgba(255,255,255,.55);-webkit-backdrop-filter:blur(18px) saturate(1.6);backdrop-filter:blur(18px) saturate(1.6);border:1px solid rgba(255,255,255,.8);border-radius:18px;box-shadow:0 8px 22px rgba(90,120,170,.18),inset 0 1px 0 rgba(255,255,255,.9);color:#1e2733}
.v-liquid .dg-card-k{color:#5a6b80}.v-liquid .dg-card-n{color:#1e2733}.v-liquid .dg-card-s{color:#2b6cff}
.v-liquid .dg-tabs{background:rgba(255,255,255,.4);-webkit-backdrop-filter:blur(16px) saturate(1.5);backdrop-filter:blur(16px) saturate(1.5);border:1px solid rgba(255,255,255,.75);border-radius:16px}
.v-liquid .dg-tab{color:#5a6b80}
.v-liquid .dg-tab.on{background:rgba(255,255,255,.85);color:#2b6cff;border-radius:11px;box-shadow:0 2px 6px rgba(90,120,170,.2)}
.v-liquid .dg-tbl{background:rgba(255,255,255,.5);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.75);border-radius:16px;color:#1e2733}
.v-liquid .dg-tbl th{background:rgba(255,255,255,.35);color:#5a6b80}
.v-liquid .dg-tbl tr+tr td{border-top:1px solid rgba(120,150,200,.22)}
.v-liquid .dg-field{background:rgba(255,255,255,.55);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.8);border-radius:16px;color:#1e2733}
.v-liquid .dg-field input,.v-liquid .dg-gl{color:#1e2733}.v-liquid .dg-field input::placeholder{color:#7d8a9c}
.v-liquid .dg-badge{background:rgba(255,255,255,.6);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.8);border-radius:999px}
.v-liquid .dg-badge.ok{color:#1c7d52}.v-liquid .dg-badge.wait{color:#b06a00}

/* ============================================================
   SOFT → JKKN heritage brand (cream paper · green ink · gold accent)
   overrides the earlier .v-soft rules by source order
   ============================================================ */
.v-soft .dg-btn{background:var(--jkkn-green);color:#fff;border:0;border-radius:999px;padding:12px 22px;box-shadow:0 8px 18px rgba(11,109,65,.28),inset 0 0 0 2px var(--jkkn-gold)}
.v-soft .dg-card{background:#fffef7;border:1px solid var(--jkkn-cream-line);border-top:3px solid var(--jkkn-gold);border-radius:16px;box-shadow:0 10px 24px rgba(11,109,65,.12);color:#123a24}
.v-soft .dg-card-k{color:#5f6b56}.v-soft .dg-card-n{color:var(--jkkn-green)}.v-soft .dg-card-s{color:var(--jkkn-green)}
.v-soft .dg-tabs{background:#fffef7;border:1px solid var(--jkkn-cream-line);border-radius:999px;box-shadow:0 8px 20px rgba(11,109,65,.10)}
.v-soft .dg-tab{color:#6a7360}
.v-soft .dg-tab.on{background:var(--jkkn-green);color:#fff;border-radius:999px}
.v-soft .dg-tbl{background:#fffef7;border:1px solid var(--jkkn-cream-line);border-radius:14px;box-shadow:0 10px 22px rgba(11,109,65,.10);color:#123a24;overflow:hidden}
.v-soft .dg-tbl th{background:transparent;color:var(--jkkn-green);border-bottom:2px solid var(--jkkn-gold)}
.v-soft .dg-tbl tr+tr td{border-top:1px solid var(--jkkn-cream-line)}
.v-soft .dg-field{background:#fffef7;border:1px solid var(--jkkn-cream-line);border-bottom:2px solid var(--jkkn-gold);border-radius:12px;color:#123a24}
.v-soft .dg-field input,.v-soft .dg-gl{color:#123a24}.v-soft .dg-field input::placeholder{color:#8a8a6a}
.v-soft .dg-badge.ok{background:var(--jkkn-green);color:#fff;box-shadow:0 4px 12px rgba(11,109,65,.2)}
.v-soft .dg-badge.wait{background:var(--jkkn-gold);color:var(--jkkn-gold-ink)}

/* MINIMAL · JKKN gold as the secondary accent */
.v-minimal .dg-card{border-left-color:var(--jkkn-gold)}
.v-minimal .dg-tbl th{border-bottom:1.5px solid var(--jkkn-gold)}
.v-minimal .dg-badge.wait{color:var(--jkkn-gold-ink)}

/* ============================================================
   PHASE-1 EXPANSION — per-vibe token layer + 24 new elements.
   New elements read the --v-* tokens so each vibe styles them for free.
   ============================================================ */
.dg-tile{--v-accent:var(--jkkn);--v-accent-fg:var(--jkkn-fg);--v-surface:var(--card);--v-surface-ink:var(--ink);--v-line:var(--line);--v-track:var(--line);--v-muted:var(--soft-ink);--v-radius:9px;--v-shadow:0 1px 2px rgba(0,0,0,.06)}
.v-current{--v-radius:8px}
.v-minimal{--v-accent:var(--jkkn);--v-surface:transparent;--v-line:var(--line);--v-track:var(--line);--v-radius:0;--v-shadow:none}
.v-soft{--v-accent:var(--jkkn-green);--v-accent-fg:#fff;--v-surface:#fffef7;--v-surface-ink:#123a24;--v-line:var(--jkkn-cream-line);--v-track:#efe7c4;--v-muted:#6a7360;--v-radius:16px;--v-shadow:0 8px 20px rgba(11,109,65,.12)}
.v-neo{--v-accent:#0bd67a;--v-accent-fg:#08130c;--v-surface:#fff;--v-surface-ink:#111;--v-line:#111;--v-track:#ddd9c9;--v-muted:#444;--v-radius:3px;--v-shadow:4px 4px 0 #111}
.v-glass{--v-accent:rgba(255,255,255,.92);--v-accent-fg:#0b3b2a;--v-surface:rgba(255,255,255,.16);--v-surface-ink:#fff;--v-line:rgba(255,255,255,.4);--v-track:rgba(255,255,255,.3);--v-muted:rgba(255,255,255,.82);--v-radius:14px;--v-shadow:0 6px 20px rgba(0,0,0,.18)}
.v-liquid{--v-accent:#2b6cff;--v-accent-fg:#fff;--v-surface:rgba(255,255,255,.55);--v-surface-ink:#1e2733;--v-line:rgba(255,255,255,.8);--v-track:rgba(120,150,200,.28);--v-muted:#5a6b80;--v-radius:16px;--v-shadow:0 8px 22px rgba(90,120,170,.18)}
.v-material{--v-accent:#00695c;--v-accent-fg:#fff;--v-surface:#fff;--v-surface-ink:#1c2a24;--v-line:#e0e3e0;--v-track:#e0e3e0;--v-muted:#5f6b65;--v-radius:6px;--v-shadow:0 2px 6px rgba(0,0,0,.14)}

.dg-surface{background:var(--v-surface);color:var(--v-surface-ink);border:1px solid var(--v-line);border-radius:var(--v-radius);box-shadow:var(--v-shadow)}
.v-neo .dg-surface{border-width:2.5px}
.v-minimal .dg-surface{border:0;border-left:2px solid var(--v-accent);box-shadow:none}
.v-glass .dg-surface,.v-liquid .dg-surface{-webkit-backdrop-filter:blur(12px) saturate(1.4);backdrop-filter:blur(12px) saturate(1.4)}

.dg-row2{display:flex;gap:16px;align-items:center;justify-content:center}
.dg-col2{display:flex;flex-direction:column;gap:10px;color:var(--v-surface-ink);font-size:12.5px}

/* TOGGLE */
.dg-switch{width:42px;height:24px;border-radius:999px;background:var(--v-track);border:1px solid var(--v-line);position:relative;display:inline-block;flex:none}
.dg-switch i{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.3)}
.dg-switch.on{background:var(--v-accent);border-color:var(--v-accent)}
.dg-switch.on i{left:auto;right:2px}
.v-neo .dg-switch{border-radius:3px;box-shadow:2px 2px 0 #111}.v-neo .dg-switch i{border-radius:2px}

/* CHECKBOX */
.dg-check{display:flex;align-items:center;gap:9px;color:var(--v-surface-ink)}
.dg-box{width:18px;height:18px;border-radius:5px;border:1.5px solid var(--v-line);display:grid;place-items:center;font-size:12px;color:transparent;flex:none;background:var(--v-surface)}
.dg-box.on{background:var(--v-accent);border-color:var(--v-accent);color:var(--v-accent-fg)}
.v-neo .dg-box{border:2px solid #111;border-radius:2px}.v-material .dg-box{border-radius:3px}

/* RADIO */
.dg-radio{display:flex;align-items:center;gap:9px;color:var(--v-surface-ink)}
.dg-dot{width:18px;height:18px;border-radius:50%;border:1.5px solid var(--v-line);display:grid;place-items:center;flex:none;background:var(--v-surface)}
.dg-radio.on .dg-dot{border-color:var(--v-accent)}
.dg-radio.on .dg-dot::after{content:"";width:9px;height:9px;border-radius:50%;background:var(--v-accent)}
.v-neo .dg-dot{border:2px solid #111}

/* SELECT */
.dg-select{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;max-width:220px;background:var(--v-surface);color:var(--v-surface-ink);border:1px solid var(--v-line);border-radius:var(--v-radius);padding:11px 13px;font-size:13px;box-shadow:var(--v-shadow)}
.dg-caret{color:var(--v-muted);font-size:11px}
.v-neo .dg-select{border:2.5px solid #111;box-shadow:4px 4px 0 #111}
.v-minimal .dg-select{border:0;border-bottom:1.5px solid var(--v-line);box-shadow:none}
.v-glass .dg-select,.v-liquid .dg-select{-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}
.v-material .dg-select{border:0;border-bottom:2px solid var(--v-accent);border-radius:6px 6px 0 0;background:#eceff1;color:#1c2a24}

/* PROGRESS */
.dg-prog-wrap{display:flex;align-items:center;gap:10px;width:100%;max-width:220px}
.dg-prog{flex:1;height:9px;border-radius:999px;background:var(--v-track);overflow:hidden}
.dg-prog i{display:block;height:100%;background:var(--v-accent);border-radius:999px}
.dg-prog-n{font-size:12px;font-weight:700;color:var(--v-surface-ink);font-variant-numeric:tabular-nums}
.v-neo .dg-prog{border:2px solid #111;border-radius:0;background:#fff}.v-neo .dg-prog i{border-radius:0}

/* AVATAR */
.dg-avs{display:flex}
.dg-av{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:700;color:#fff;background:var(--jkkn);border:2px solid var(--card);margin-left:-8px}
.dg-av:first-child{margin-left:0}
.dg-av.g2{background:#2f7d9a}.dg-av.g3{background:#9a5a2f}
.dg-av.more{background:var(--v-track);color:var(--v-surface-ink)}
.v-soft .dg-av{border-color:var(--jkkn-cream)}.v-soft .dg-av:first-child{background:var(--jkkn-green)}
.v-neo .dg-av{border-radius:3px;border:2px solid #111;margin-left:-6px}
.v-glass .dg-av,.v-liquid .dg-av{border-color:rgba(255,255,255,.6)}

/* ALERT */
.dg-alert{display:flex;gap:11px;align-items:flex-start;width:100%;max-width:240px;padding:12px 13px}
.dg-alert-i{width:22px;height:22px;border-radius:50%;background:var(--v-accent);color:var(--v-accent-fg);display:grid;place-items:center;font-size:12px;flex:none}
.dg-alert-t{display:flex;flex-direction:column;gap:2px;font-size:12px}
.dg-alert-t b{color:var(--v-surface-ink)}.dg-alert-t span{color:var(--v-muted)}
.v-minimal .dg-alert{border-left:3px solid var(--v-accent)}
.v-soft .dg-alert{border-left:4px solid var(--jkkn-gold)}

/* BREADCRUMB */
.dg-crumb{display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--v-muted);flex-wrap:wrap;justify-content:center}
.dg-crumb a{color:var(--v-muted);text-decoration:none}
.dg-crumb b{color:var(--v-accent)}
.v-glass .dg-crumb b{color:#fff}
.v-neo .dg-crumb b{color:#111;background:#0bd67a;padding:2px 6px;border:2px solid #111}

/* PAGINATION */
.dg-pager{display:flex;align-items:center;gap:4px;flex-wrap:wrap;justify-content:center}
.dg-pager button{width:29px;height:29px;border:1px solid var(--v-line);background:var(--v-surface);color:var(--v-surface-ink);border-radius:8px;font:inherit;font-size:12.5px;cursor:pointer;display:grid;place-items:center}
.dg-pager button.on{background:var(--v-accent);color:var(--v-accent-fg);border-color:var(--v-accent)}
.dg-pager-x{color:var(--v-muted);padding:0 2px}
.v-neo .dg-pager button{border:2px solid #111;border-radius:0}
.v-minimal .dg-pager button{border:0}.v-minimal .dg-pager button.on{background:transparent;color:var(--v-accent);border-bottom:2px solid var(--v-accent)}
.v-glass .dg-pager button,.v-liquid .dg-pager button{-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}

/* TOOLTIP */
.dg-tipwrap{position:relative;display:inline-flex;padding-top:34px}
.dg-tipbtn{border:1px dashed var(--v-line);color:var(--v-surface-ink);border-radius:var(--v-radius);padding:7px 12px;font-size:12.5px}
.dg-tip{position:absolute;top:0;left:50%;transform:translateX(-50%);background:#1f2937;color:#fff;font-size:11px;padding:5px 9px;border-radius:6px;white-space:nowrap}
.dg-tip::after{content:"";position:absolute;bottom:-5px;left:50%;transform:translateX(-50%);border:5px solid transparent;border-top-color:#1f2937;border-bottom:0}
.v-neo .dg-tip{background:#111;border-radius:0}.v-neo .dg-tip::after{border-top-color:#111}
.v-glass .dg-tip,.v-liquid .dg-tip{background:rgba(20,30,40,.72);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
.v-soft .dg-tip{background:var(--jkkn-green)}.v-soft .dg-tip::after{border-top-color:var(--jkkn-green)}
.v-material .dg-tip{background:#00695c}.v-material .dg-tip::after{border-top-color:#00695c}

/* ACCORDION */
.dg-acc{width:100%;max-width:240px;overflow:hidden}
.dg-acc-h{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;font-size:12.5px;font-weight:600;color:var(--v-surface-ink);cursor:pointer}
.dg-acc-h.on{color:var(--v-accent)}
.v-glass .dg-acc-h.on{color:#fff}
.dg-acc-b{padding:0 12px 11px;font-size:11.5px;color:var(--v-muted);border-bottom:1px solid var(--v-line)}
.dg-acc-h+.dg-acc-h{border-top:1px solid var(--v-line)}

/* SLIDER */
.dg-slider{width:100%;max-width:210px;padding:10px 0}
.dg-slider-t{position:relative;height:6px;border-radius:999px;background:var(--v-track)}
.dg-slider-t i{position:absolute;left:0;top:0;height:100%;border-radius:999px;background:var(--v-accent)}
.dg-thumb{position:absolute;top:50%;width:18px;height:18px;border-radius:50%;background:#fff;border:2px solid var(--v-accent);transform:translate(-50%,-50%);box-shadow:0 1px 3px rgba(0,0,0,.3)}
.v-neo .dg-slider-t{border-radius:0;border:2px solid #111;background:#fff}.v-neo .dg-thumb{border-radius:0;box-shadow:2px 2px 0 #111}

/* DATE PICKER */
.dg-cal{width:100%;max-width:220px;padding:11px 12px}
.dg-cal-h{display:flex;align-items:center;justify-content:space-between;font-size:12.5px;font-weight:600;color:var(--v-surface-ink);margin-bottom:9px}
.dg-cal-h span{color:var(--v-muted)}
.dg-cal-g{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
.dg-cal-d{aspect-ratio:1;display:grid;place-items:center;font-size:11px;border-radius:7px;color:var(--v-surface-ink)}
.dg-cal-d.on{background:var(--v-accent);color:var(--v-accent-fg)}
.v-neo .dg-cal-d{border-radius:0}

/* EMPTY STATE */
.dg-empty2{display:flex;flex-direction:column;align-items:center;gap:5px;text-align:center;color:var(--v-muted);font-size:11.5px;padding:6px}
.dg-empty-i{font-size:26px}
.dg-empty2 b{color:var(--v-surface-ink);font-size:13px}
.dg-empty2 .dg-btn{margin-top:6px}

/* SKELETON */
.dg-skel{display:flex;gap:11px;align-items:center;width:100%;max-width:230px;padding:13px}
.dg-sk-av{width:36px;height:36px;border-radius:50%;background:var(--v-track);flex:none}
.dg-sk-lines{flex:1;display:flex;flex-direction:column;gap:7px}
.dg-sk-l{height:9px;border-radius:5px;background:var(--v-track)}
.dg-sk-l.w70{width:70%}.dg-sk-l.w45{width:45%}
.v-neo .dg-sk-av{border-radius:0}.v-neo .dg-sk-l{border-radius:0}
@media (prefers-reduced-motion:no-preference){
.dg-sk-av,.dg-sk-l{background:linear-gradient(90deg,var(--v-track) 25%,var(--v-line) 37%,var(--v-track) 63%);background-size:400% 100%;animation:dg-shimmer 1.4s ease infinite}
@keyframes dg-shimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}
}

/* MODAL */
.dg-modal{display:flex;flex-direction:column;gap:5px;width:100%;max-width:220px;padding:16px}
.dg-modal b{color:var(--v-surface-ink);font-size:14px}
.dg-modal>span{color:var(--v-muted);font-size:12px}
.dg-modal-a{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}
.dg-modal-a .dg-btn{padding:8px 14px;font-size:12.5px}
.dg-btn.ghost{background:transparent;color:var(--v-muted);border:1px solid var(--v-line);box-shadow:none;text-shadow:none}

/* TOAST */
.dg-toast{display:flex;align-items:center;gap:10px;width:100%;max-width:230px;padding:11px 13px}
.dg-toast-i{width:20px;height:20px;border-radius:50%;background:var(--v-accent);color:var(--v-accent-fg);display:grid;place-items:center;font-size:11px;flex:none}
.dg-toast-t{flex:1;font-size:12.5px;color:var(--v-surface-ink)}
.dg-toast button{border:0;background:transparent;color:var(--v-muted);font-size:16px;line-height:1;cursor:pointer}

/* SIDEBAR ITEM */
.dg-side{display:flex;flex-direction:column;gap:3px;width:100%;max-width:200px}
.dg-side-i{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:var(--v-radius);font-size:12.5px;font-weight:600;color:var(--v-muted)}
.dg-side-i.on{background:var(--v-accent);color:var(--v-accent-fg)}
.v-minimal .dg-side-i.on{background:transparent;color:var(--v-accent);border-left:3px solid var(--v-accent)}
.v-neo .dg-side-i.on{border:2px solid #111;box-shadow:3px 3px 0 #111}
.v-soft .dg-side-i.on{box-shadow:0 6px 14px rgba(11,109,65,.25)}
.v-material .dg-side-i.on{border-radius:0 20px 20px 0}

/* STEPPER */
.dg-steps{display:flex;align-items:center}
.dg-step{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:700;background:var(--v-track);color:var(--v-muted);flex:none}
.dg-step.on{background:var(--v-accent);color:var(--v-accent-fg)}
.dg-step.done{background:var(--v-accent);color:var(--v-accent-fg);opacity:.55}
.dg-step-l{width:26px;height:3px;background:var(--v-track)}
.dg-step-l.done{background:var(--v-accent)}
.v-neo .dg-step{border-radius:0;border:2px solid #111}

/* FILE UPLOAD */
.dg-upload{display:flex;flex-direction:column;align-items:center;gap:4px;width:100%;max-width:220px;padding:20px 14px;border:2px dashed var(--v-line);border-radius:var(--v-radius);color:var(--v-muted);font-size:11.5px;text-align:center}
.dg-upload b{color:var(--v-surface-ink);font-size:13px}
.dg-upload-i{font-size:22px;color:var(--v-accent)}
.v-neo .dg-upload{border:2.5px dashed #111}
.v-glass .dg-upload,.v-liquid .dg-upload{background:var(--v-surface);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}

/* RATING */
.dg-rate{display:flex;gap:4px;font-size:22px;color:var(--v-track)}
.dg-rate .on{color:var(--v-accent)}
.v-current .dg-rate .on,.v-minimal .dg-rate .on,.v-soft .dg-rate .on{color:#f2b500}
.v-glass .dg-rate .on{color:#ffe14d}

/* TAG INPUT */
.dg-chipin{display:flex;flex-wrap:wrap;gap:6px;align-items:center;width:100%;max-width:230px;padding:9px 10px}
.dg-chip2{display:inline-flex;align-items:center;gap:5px;background:var(--v-accent);color:var(--v-accent-fg);font-size:11.5px;font-weight:600;padding:4px 9px;border-radius:999px}
.dg-chip2 b{opacity:.7;cursor:pointer}
.dg-chipph{font-size:11.5px;color:var(--v-muted)}
.v-neo .dg-chip2{border-radius:2px;border:2px solid #111;box-shadow:2px 2px 0 #111}
.v-minimal .dg-chip2{background:transparent;color:var(--v-accent);border:1px solid var(--v-accent)}
.v-soft .dg-chip2{background:var(--jkkn-gold);color:var(--jkkn-gold-ink)}

/* SEGMENTED CONTROL */
.dg-seg2{display:inline-flex;background:var(--v-track);border-radius:var(--v-radius);padding:3px;gap:2px}
.dg-seg2 button{border:0;background:transparent;color:var(--v-muted);font:inherit;font-weight:600;font-size:12px;padding:7px 14px;border-radius:calc(var(--v-radius) - 3px);cursor:pointer}
.dg-seg2 button.on{background:var(--v-surface);color:var(--v-accent);box-shadow:0 1px 2px rgba(0,0,0,.12)}
.v-neo .dg-seg2{border:2.5px solid #111}.v-neo .dg-seg2 button.on{background:#0bd67a;color:#08130c}
.v-glass .dg-seg2 button.on,.v-liquid .dg-seg2 button.on{background:var(--v-accent);color:var(--v-accent-fg)}

/* KPI TREND */
.dg-kpi{display:flex;flex-direction:column;gap:4px;width:100%;max-width:210px;padding:14px 15px}
.dg-kpi-k{font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--v-muted);font-weight:600}
.dg-kpi-row{display:flex;align-items:baseline;gap:8px}
.dg-kpi-n{font-size:24px;font-weight:800;color:var(--v-surface-ink);font-variant-numeric:tabular-nums}
.dg-kpi-d{font-size:11px;font-weight:700}
.dg-kpi-d.up{color:var(--good)}
.v-glass .dg-kpi-d.up{color:#d6ffe9}
.dg-kpi-spark{width:100%;height:26px;margin-top:2px}
.dg-kpi-spark polyline{fill:none;stroke:var(--v-accent);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}

/* TIMELINE */
.dg-tl{display:flex;flex-direction:column;width:100%;max-width:210px;padding:4px 0}
.dg-tl-i{display:flex;gap:11px;position:relative;padding:0 0 14px 0}
.dg-tl-i:not(:last-child)::before{content:"";position:absolute;left:6px;top:14px;bottom:0;width:2px;background:var(--v-line)}
.dg-tl-dot{width:14px;height:14px;border-radius:50%;background:var(--v-track);border:2px solid var(--v-surface);flex:none;margin-top:1px;z-index:1}
.dg-tl-dot.on{background:var(--v-accent)}
.dg-tl-t{display:flex;flex-direction:column;gap:1px;font-size:12px}
.dg-tl-t b{color:var(--v-surface-ink)}.dg-tl-t span{color:var(--v-muted);font-size:10.5px}
.v-neo .dg-tl-dot{border-radius:0;border:2px solid #111}

.dg-footer{margin-top:36px;padding-top:18px;border-top:1px solid var(--line);color:var(--faint-ink);font-size:12.5px}
.dg-footer code{font-family:ui-monospace,monospace;font-size:11.5px}
@media (prefers-reduced-motion:reduce){.dg *{transition:none!important}}
`;
