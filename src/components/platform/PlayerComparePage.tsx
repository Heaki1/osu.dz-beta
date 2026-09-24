import React, { useState } from 'react';
import { api } from '../../api/client';
import { Trophy, Globe2, Search } from 'lucide-react';

export function PlayerComparePage() {
  const [a, setA] = useState(''); const [b, setB] = useState('');
  const [result, setResult] = useState<import('../../api/client').ApiReadResult<{ platform: Array<{ user_id: number; username: string; osu_id: string; avatar_url: string | null; global_rank: number | null; dzpp: number; rounds: number; wins: number; best: number | null }>; osu: Array<{ id: number; username: string; country: string; avatarUrl: string; globalRank: number | null }> }> | null>(null);
  const [busy, setBusy] = useState(false);
  const compare = async () => { if (!a.trim() || !b.trim()) return; setBusy(true); setResult(await api.platform.compare(a.trim(), b.trim())); setBusy(false); };
  return <div className="max-w-5xl mx-auto px-6 py-8 pb-16">
    <div className="mb-8"><p className="text-[10px] uppercase tracking-widest text-purple-400 font-mono">Player comparison</p><h1 className="text-2xl font-black text-white mt-1">Compare osu! + osu!DZ</h1><p className="text-sm text-slate-500 mt-2">Compare DZPP progression with the live osu! profile snapshot.</p></div>
    <div className="flex flex-col md:flex-row gap-3 mb-8"><input value={a} onChange={(e) => setA(e.target.value)} placeholder="First player" className="flex-1 rounded-xl bg-[#0d1526] border border-slate-800 px-4 py-3 text-sm text-white outline-none"/><input value={b} onChange={(e) => setB(e.target.value)} placeholder="Second player" className="flex-1 rounded-xl bg-[#0d1526] border border-slate-800 px-4 py-3 text-sm text-white outline-none"/><button onClick={() => void compare()} disabled={busy} className="rounded-xl bg-purple-500 px-5 py-3 text-sm font-black text-white disabled:opacity-40"><Search className="w-4 h-4 inline mr-2"/>{busy ? 'Loading…' : 'Compare'}</button></div>
    {result?.ok && <div className="space-y-5"><div className="grid md:grid-cols-2 gap-5">{result.data.platform.map((p) => <section key={p.user_id} className="rounded-2xl border border-slate-800 bg-[#0d1526] p-5"><h2 className="text-lg font-black text-white">{p.username}</h2><div className="grid grid-cols-2 gap-4 mt-5"><Metric label="DZPP" value={p.dzpp.toLocaleString()}/><Metric label="Rounds" value={p.rounds}/><Metric label="Wins" value={p.wins}/><Metric label="Best place" value={p.best ?? '—'}/></div></section>)}</div><section className="rounded-2xl border border-slate-800 bg-[#0d1526] p-5"><div className="flex items-center gap-2 mb-4"><Globe2 className="w-4 h-4 text-sky-400"/><h2 className="text-sm font-black text-white">osu! profile</h2></div><div className="grid md:grid-cols-2 gap-4">{result.data.osu.map((p) => <div key={p.id} className="rounded-xl bg-slate-900/50 p-4"><p className="font-bold text-white">{p.username}</p><p className="text-xs text-slate-500 mt-1">{p.country} · global rank {p.globalRank?.toLocaleString() ?? 'unranked'}</p></div>)}</div></section></div>}
    {!result && <div className="rounded-2xl border border-slate-800 bg-[#0d1526] p-12 text-center text-sm text-slate-600"><Trophy className="w-7 h-7 mx-auto mb-3"/>Enter two osu! usernames to compare them.</div>}
    {result && !result.ok && <p className="text-sm text-rose-400">{result.error}</p>}
  </div>;
}
function Metric({ label, value }: { label: string; value: React.ReactNode }) { return <div><p className="text-[9px] uppercase tracking-widest text-slate-600 font-mono">{label}</p><p className="text-xl font-black text-white mt-1">{value}</p></div>; }
