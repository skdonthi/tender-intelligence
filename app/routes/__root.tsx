import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Patterno — Procurement Intelligence" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" as const },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap",
      },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}

const GLOBAL_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    /* Light theme — aligned to Patterno HIT's airy, card-based UI. */
    --bg: #F6F6F4; --surface: #FFFFFF; --surface-hi: #F0F1F3;
    --border: #E7E8EB; --border-hi: #D7DAE0;
    --blue: #2A6FDB; --blue-dim: #DCE7F9;
    --ink: #15171C; /* near-black primary buttons / active items */
    --green: #16A34A; --amber: #B7791F; --red: #DC2626;
    --text: #1A1D23; --text-muted: #6B7280; --text-dim: #4B5563;
    --mono: 'IBM Plex Mono', monospace; --sans: 'Inter', system-ui, sans-serif;
    --radius: 6px;
  }
  html, body { height: 100%; background: var(--bg); color: var(--text);
    font-family: var(--sans); font-size: 14px; line-height: 1.5;
    -webkit-font-smoothing: antialiased; }
  .app { display: grid; grid-template-rows: 48px 1fr;
    grid-template-columns: 260px 1fr 340px; height: 100vh; overflow: hidden; }
  header { grid-column: 1 / -1; display: flex; align-items: center; gap: 12px;
    padding: 0 20px; border-bottom: 1px solid var(--border); background: var(--surface); }
  .logo { font-family: var(--mono); font-size: 13px; font-weight: 500;
    letter-spacing: 0.08em; color: var(--text); text-transform: uppercase; }
  .logo-mark { display: inline-block; width: 20px; height: 20px; background: var(--blue);
    clip-path: polygon(50% 0%, 100% 100%, 0% 100%); margin-right: 4px;
    vertical-align: middle; position: relative; top: -1px; }
  .header-tag { font-family: var(--mono); font-size: 10px; color: var(--text-muted);
    letter-spacing: 0.1em; text-transform: uppercase; border: 1px solid var(--border-hi);
    padding: 2px 6px; border-radius: var(--radius); }
  .header-right { margin-left: auto; display: flex; align-items: center; gap: 16px; }
  .status-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green);
    box-shadow: 0 0 6px var(--green); animation: pulse 2.5s ease-in-out infinite; }
  .status-label { font-family: var(--mono); font-size: 11px; color: var(--text-muted); }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  .rail { border-right: 1px solid var(--border); overflow-y: auto; display: flex; flex-direction: column; }
  .rail-header { padding: 14px 16px 10px; border-bottom: 1px solid var(--border);
    display: flex; align-items: center; justify-content: space-between; }
  .rail-title { font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--text-muted); }
  .doc-count { font-family: var(--mono); font-size: 11px; color: var(--text-muted); }
  .doc-list { flex: 1; }
  .doc-item { padding: 12px 16px; border-bottom: 1px solid var(--border);
    cursor: pointer; transition: background 0.1s; position: relative; }
  .doc-item:hover { background: var(--surface-hi); }
  .doc-item.active { background: var(--surface-hi); }
  .doc-item.active::before { content: ''; position: absolute; left: 0; top: 0;
    bottom: 0; width: 2px; background: var(--blue); }
  .doc-name { font-size: 12px; font-weight: 500; color: var(--text);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px; }
  .doc-meta { display: flex; align-items: center; gap: 8px; }
  .doc-date { font-family: var(--mono); font-size: 10px; color: var(--text-muted); }
  .conf-badge { font-family: var(--mono); font-size: 10px; padding: 1px 5px;
    border-radius: var(--radius); font-weight: 500; }
  .conf-high { background: rgba(74,222,128,0.12); color: var(--green); }
  .conf-mid  { background: rgba(245,158,11,0.12);  color: var(--amber); }
  .conf-low  { background: rgba(239,68,68,0.12);   color: var(--red); }
  .upload-zone { margin: 12px; border: 1px dashed var(--border-hi);
    border-radius: var(--radius); padding: 20px 16px; text-align: center;
    cursor: pointer; transition: border-color 0.15s, background 0.15s; }
  .upload-zone:hover, .upload-zone.drag-over { border-color: var(--blue); background: rgba(42,111,219,0.06); }
  .upload-zone.uploading { cursor: default; opacity: 0.7; }
  .upload-icon { font-size: 20px; margin-bottom: 6px; opacity: 0.5; }
  .upload-label { font-size: 12px; color: var(--text-muted); line-height: 1.4; }
  .upload-label strong { color: var(--blue); font-weight: 500; }
  .centre { overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 20px; }
  .empty-state { flex: 1; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 12px; color: var(--text-muted); text-align: center; }
  .empty-title { font-family: var(--mono); font-size: 12px; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--text-muted); }
  .empty-sub { font-size: 12px; color: var(--text-muted); max-width: 260px; }
  .doc-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .doc-filename { font-family: var(--mono); font-size: 11px; color: var(--text-muted);
    margin-bottom: 4px; letter-spacing: 0.04em; }
  .doc-proc-title { font-size: 16px; font-weight: 600; color: var(--text); line-height: 1.3; }
  .conf-meter { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
  .conf-meter-label { font-family: var(--mono); font-size: 9px; letter-spacing: 0.14em;
    text-transform: uppercase; color: var(--text-muted); }
  .conf-meter-segments { display: flex; gap: 2px; }
  .conf-seg { width: 14px; height: 14px; border-radius: 1px; background: var(--border-hi); transition: background 0.3s; }
  .conf-seg.filled-high { background: var(--green); }
  .conf-seg.filled-mid  { background: var(--amber); }
  .conf-seg.filled-low  { background: var(--red); }
  .conf-meter-value { font-family: var(--mono); font-size: 11px; font-weight: 500; }
  .section-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--text-muted); margin-bottom: 10px;
    padding-bottom: 6px; border-bottom: 1px solid var(--border); }
  .fields-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px;
    background: var(--border); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  .field { background: var(--surface); padding: 10px 12px; transition: background 0.1s; }
  .field:hover { background: var(--surface-hi); }
  .field.full-width { grid-column: 1 / -1; }
  .field-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
  .field-value { font-size: 13px; color: var(--text); font-weight: 500; word-break: break-word; }
  .field-null { font-family: var(--mono); font-size: 11px; color: var(--text-muted); opacity: 0.5; }
  .cpv-list { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
  .cpv-tag { font-family: var(--mono); font-size: 10px; padding: 2px 6px;
    background: var(--surface-hi); border: 1px solid var(--border-hi);
    border-radius: var(--radius); color: var(--text-dim); }
  .lots-list { display: flex; flex-direction: column; gap: 4px; }
  .lot-row { display: flex; align-items: baseline; gap: 10px; padding: 8px 12px;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); transition: background 0.1s; }
  .lot-row:hover { background: var(--surface-hi); }
  .lot-num { font-family: var(--mono); font-size: 10px; color: var(--blue); flex-shrink: 0; min-width: 32px; }
  .lot-title { font-size: 12px; font-weight: 500; color: var(--text); flex: 1; }
  .lot-value { font-family: var(--mono); font-size: 11px; color: var(--text-muted); flex-shrink: 0; }
  .missing-notice { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px;
    background: rgba(245,158,11,0.06); border: 1px solid rgba(245,158,11,0.2);
    border-radius: var(--radius); font-size: 12px; color: var(--amber); }
  .missing-notice-icon { font-family: var(--mono); font-size: 11px; flex-shrink: 0; margin-top: 1px; }
  .missing-list { font-family: var(--mono); font-size: 11px; opacity: 0.8; }
  .qa-panel { border-left: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
  .qa-header { padding: 14px 16px 10px; border-bottom: 1px solid var(--border); }
  .qa-title { font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--text-muted); }
  .qa-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; }
  .qa-empty { flex: 1; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 8px; padding: 24px; text-align: center; }
  .qa-empty-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--text-muted); }
  .qa-empty-hints { display: flex; flex-direction: column; gap: 4px; width: 100%; margin-top: 8px; }
  .qa-hint { padding: 8px 10px; background: var(--surface-hi); border: 1px solid var(--border-hi);
    border-radius: var(--radius); font-size: 12px; color: var(--text-dim); cursor: pointer;
    text-align: left; font-family: var(--sans); transition: border-color 0.1s, color 0.1s; }
  .qa-hint:hover:not(:disabled) { border-color: var(--blue-dim); color: var(--text); }
  .qa-hint:disabled { opacity: 0.4; cursor: not-allowed; }
  .msg { display: flex; flex-direction: column; gap: 4px; }
  .msg-role { font-family: var(--mono); font-size: 9px; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--text-muted); }
  .msg-body { font-size: 12px; line-height: 1.55; color: var(--text); padding: 10px 12px; border-radius: var(--radius); }
  .msg.user .msg-body { background: var(--blue-dim); color: var(--text); align-self: flex-end; max-width: 90%; }
  .msg.assistant .msg-body { background: var(--surface-hi); border: 1px solid var(--border-hi); }
  .sources-toggle { font-family: var(--mono); font-size: 10px; color: var(--text-muted);
    cursor: pointer; display: flex; align-items: center; gap: 4px; margin-top: 4px;
    padding: 0; background: none; border: none; letter-spacing: 0.06em; }
  .sources-toggle:hover { color: var(--text-dim); }
  .sources-list { display: none; flex-direction: column; gap: 4px; margin-top: 6px; }
  .sources-list.open { display: flex; }
  .source-item { padding: 6px 8px; background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); font-size: 11px; color: var(--text-muted); line-height: 1.4; }
  .source-score { font-family: var(--mono); font-size: 10px; color: var(--blue); margin-bottom: 2px; }
  .qa-input-row { padding: 12px; border-top: 1px solid var(--border); display: flex; gap: 8px; }
  .qa-input { flex: 1; background: var(--surface-hi); border: 1px solid var(--border-hi);
    border-radius: var(--radius); padding: 8px 10px; font-family: var(--sans);
    font-size: 12px; color: var(--text); outline: none; resize: none;
    min-height: 36px; max-height: 100px; line-height: 1.4; transition: border-color 0.15s; }
  .qa-input:focus { border-color: var(--blue); }
  .qa-input::placeholder { color: var(--text-muted); }
  .qa-input:disabled { opacity: 0.5; }
  .qa-send { width: 36px; height: 36px; background: var(--blue); border: none;
    border-radius: var(--radius); color: #fff; cursor: pointer;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    transition: background 0.1s, opacity 0.1s; }
  .qa-send:hover:not(:disabled) { background: #3B7FEB; }
  .qa-send:disabled { opacity: 0.4; cursor: not-allowed; }
  .spinner { display: inline-block; width: 12px; height: 12px;
    border: 1.5px solid var(--border-hi); border-top-color: var(--blue);
    border-radius: 50%; animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  #toast { position: fixed; bottom: 20px; right: 20px; padding: 10px 14px;
    border-radius: var(--radius); font-family: var(--mono); font-size: 11px;
    z-index: 100; opacity: 0; transform: translateY(8px);
    transition: opacity 0.2s, transform 0.2s; pointer-events: none; }
  #toast.show { opacity: 1; transform: translateY(0); }
  #toast.success { background: rgba(74,222,128,0.15); border: 1px solid rgba(74,222,128,0.3); color: var(--green); }
  #toast.error   { background: rgba(239,68,68,0.15);  border: 1px solid rgba(239,68,68,0.3);  color: var(--red); }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border-hi); border-radius: 2px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
  @media (max-width: 900px) {
    .app { grid-template-columns: 1fr; grid-template-rows: 48px auto 1fr auto;
      overflow: auto; height: auto; min-height: 100vh; }
    header { grid-column: 1; }
    .rail { border-right: none; border-bottom: 1px solid var(--border); max-height: 240px; }
    .qa-panel { border-left: none; border-top: 1px solid var(--border); min-height: 360px; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, .status-dot, .spinner { animation: none !important; transition: none !important; }
  }

  /* ── HIT-style light polish ──────────────────────────────────────────────── */
  /* Soft shadows give white surfaces the airy "card" lift HIT uses. */
  .fields-grid, .lot-row, .source-item, .qa-hint, .upload-zone,
  .missing-notice, .relevance-lot, .msg.assistant .msg-body {
    box-shadow: 0 1px 2px rgba(16, 18, 24, 0.05);
  }
  header { box-shadow: 0 1px 0 var(--border); }
  /* Pill-shaped tags / badges, like HIT's category + relevance chips. */
  .conf-badge, .cpv-tag, .relevance-badge { border-radius: 999px; }
  /* Dark near-black primary buttons (HIT's "Details ansehen" style). */
  .qa-send { background: var(--ink); }
  .qa-send:hover:not(:disabled) { background: #2A2E38; }
  /* Amber relevance badge as a soft filled pill (matches "X von Y Losen relevant"). */
  .relevance-badge { background: rgba(183, 121, 31, 0.12); border-color: transparent !important; }
`;
