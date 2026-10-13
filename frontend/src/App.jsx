import React, { useCallback, useEffect, useState } from 'react';
import { Activity, Bot, Factory, Gauge, Play, RotateCcw, ShieldAlert, GraduationCap, CheckCircle2, AlertTriangle, Cpu, Workflow } from 'lucide-react';
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const API = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const stages = ['Empty', 'Loaded', 'Machine 1 ready', 'Machine 1 complete', 'Transferred', 'Machine 2 ready', 'Machine 2 complete', 'Product complete'];
const actionList = [
  ['load', 'Load workpiece'], ['start_m1', 'Start Machine 1'], ['process_m1', 'Process at Machine 1'],
  ['transfer', 'Transfer to Machine 2'], ['start_m2', 'Start Machine 2'], ['process_m2', 'Process at Machine 2'], ['unload', 'Unload finished product']
];

export default function App() {
  const [data, setData] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [episodes, setEpisodes] = useState(500);

  const request = useCallback(async (path, options={}) => {
    const response = await fetch(`${API}${path}`, { headers: {'Content-Type':'application/json'}, ...options });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.detail || 'Request failed. Check that the backend is running.');
    return body;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [s, m] = await Promise.all([request('/api/status'), request('/api/metrics')]);
      setData(s); setMetrics(m); setError('');
    } catch (e) { setError(e.message); }
  }, [request]);

  useEffect(() => { refresh(); const id = setInterval(refresh, 2500); return () => clearInterval(id); }, [refresh]);

  async function runTask(path, options, success) {
    setBusy(true); setNotice(''); setError('');
    try { const result = await request(path, options); if (result.cell) setData(prev => ({...prev, cell: result.cell})); await refresh(); setNotice(success || result.message || 'Done.'); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const cell = data?.cell;
  const training = data?.training;
  const chartData = metrics?.training_log || [];
  const statusText = cell?.emergency_stop ? 'Emergency stop' : cell?.done ? 'Cycle complete' : 'Simulation ready';

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-icon"><Factory size={23}/></div><div><div className="brand-title">CELL<span>AI</span></div><div className="brand-subtitle">INTELLIGENT MANUFACTURING SIMULATOR</div></div></div>
      <div className="top-status"><span className={`status-dot ${cell?.emergency_stop ? 'danger' : ''}`}></span>{statusText}<span className="version">V1.0 · SIMULATION</span></div>
    </header>

    <main className="main">
      <section className="hero">
        <div><div className="eyebrow"><span className="eyebrow-line"></span> REINFORCEMENT LEARNING LAB</div>
          <h1>Teaching an AI Agent to<br/><span>Operate a Manufacturing Cell</span></h1>
          <p>Train an intelligent agent to complete a production workflow while respecting machine states and safety constraints.</p>
        </div>
        <div className="hero-mark"><Bot size={66} strokeWidth={1.15}/><span>AI AGENT<br/>ONLINE</span></div>
      </section>

      {error && <div className="alert error"><AlertTriangle size={18}/><div><b>Backend connection issue</b><br/>{error}<div className="hint">Start FastAPI at http://127.0.0.1:8000 or configure VITE_API_URL for your deployed API.</div></div></div>}
      {notice && <div className="alert success"><CheckCircle2 size={18}/>{notice}</div>}

      <section className="metrics-grid">
        <Metric icon={<Gauge/>} label="TOTAL REWARD" value={cell ? cell.total_reward : '—'} foot="Current production episode"/>
        <Metric icon={<Workflow/>} label="PROCESS STEPS" value={cell ? cell.steps : '—'} foot="Actions attempted"/>
        <Metric icon={<ShieldAlert/>} label="INVALID ACTIONS" value={cell ? cell.invalid_actions : '—'} foot="Blocked by safety rules"/>
        <Metric icon={<GraduationCap/>} label="TRAINING SUCCESS" value={training?.trained ? `${training.success_rate}%` : 'Not trained'} foot={training?.trained ? `${training.episodes} training episodes` : 'Train the agent below'}/>
      </section>

      <div className="content-grid">
        <section className="panel cell-panel">
          <div className="panel-head"><div><div className="panel-kicker">01 / DIGITAL TWIN</div><h2>Virtual Manufacturing Cell</h2></div><span className="live-pill"><span/> LIVE STATE</span></div>
          <div className="factory-floor">
            <div className={`machine ${cell?.m1_on ? 'running' : ''} ${cell?.stage >= 3 ? 'complete' : ''}`}>
              <div className="machine-number">01</div><Cpu size={35}/><b>Machine 1</b><span className="machine-state">{cell?.m1_on ? 'RUNNING' : cell?.stage >= 3 ? 'COMPLETE' : 'STANDBY'}</span>
            </div>
            <div className="conveyor"><div className={`workpiece ${cell && cell.stage > 0 && cell.stage < 7 ? 'visible' : ''} ${cell?.stage >= 4 ? 'moved' : ''}`}></div><div className="belt"></div><span>TRANSFER LINE</span></div>
            <div className={`machine ${cell?.m2_on ? 'running' : ''} ${cell?.stage >= 6 ? 'complete' : ''}`}>
              <div className="machine-number">02</div><Cpu size={35}/><b>Machine 2</b><span className="machine-state">{cell?.m2_on ? 'RUNNING' : cell?.stage >= 6 ? 'COMPLETE' : 'STANDBY'}</span>
            </div>
          </div>
          <div className="stage-block"><div className="stage-top"><span>PRODUCTION WORKFLOW</span><b>{cell ? `${cell.stage}/7` : '—'}</b></div>
            <div className="progress-track"><div style={{width:`${(cell?.stage || 0)/7*100}%`}}/></div>
            <div className="stage-name">{cell?.stage_name || 'Connecting to simulation…'}</div>
            <div className="steps-row">{['Load','Start M1','Process','Transfer','Start M2','Process','Unload'].map((s,i)=><div key={s} className={`step-chip ${(cell?.stage || 0)>i ? 'done' : (cell?.stage || 0)===i ? 'active' : ''}`}><span>{i+1}</span>{s}</div>)}</div>
          </div>
          <div className="panel-actions">
            <button className="btn primary" disabled={busy || !cell || cell.done || cell.emergency_stop} onClick={()=>runTask('/api/step',{method:'POST'},'AI agent executed one action.')}><Play size={16} fill="currentColor"/> Run AI Step</button>
            <button className="btn secondary" disabled={busy} onClick={()=>runTask('/api/reset',{method:'POST'},'Cell reset successfully.')}><RotateCcw size={16}/> Reset Cell</button>
            <button className="btn danger-btn" disabled={busy || cell?.emergency_stop} onClick={()=>runTask('/api/emergency-stop',{method:'POST'},'Emergency stop activated.')}><ShieldAlert size={16}/> Emergency Stop</button>
          </div>
        </section>

        <section className="panel agent-panel">
          <div className="panel-head"><div><div className="panel-kicker">02 / LEARNING SYSTEM</div><h2>AI Agent Control</h2></div><div className="agent-avatar"><Bot size={25}/></div></div>
          <div className="agent-status"><div className="pulse-icon"><Activity size={22}/></div><div><b>{training?.trained ? 'Agent trained' : 'Agent awaiting training'}</b><span>{training?.trained ? `${training.q_states_learned || 0} states learned` : 'Train to update Q-values'}</span></div><span className={`status-tag ${training?.trained ? 'trained' : ''}`}>{training?.trained ? 'TRAINED' : 'UNTRAINED'}</span></div>
          <label className="field-label" htmlFor="episodes">Training episodes <b>{episodes}</b></label>
          <input id="episodes" type="range" min="100" max="2000" step="100" value={episodes} onChange={e=>setEpisodes(Number(e.target.value))}/>
          <div className="range-labels"><span>100 episodes</span><span>2000 episodes</span></div>
          <button className="btn primary full" disabled={busy} onClick={()=>runTask('/api/train',{method:'POST',body:JSON.stringify({episodes})},'Agent training finished. Review the training metrics.')}>
            <GraduationCap size={17}/>{busy ? 'Processing…' : 'Train AI Agent'}
          </button>
          <div className="agent-stats">
            <div><span>Average reward</span><b>{training?.trained ? training.avg_reward : '—'}</b></div>
            <div><span>Learned states</span><b>{training?.q_states_learned ?? '—'}</b></div>
            <div><span>Safety events</span><b>{cell?.safety_events ?? 0}</b></div>
          </div>
          <div className="note"><ShieldAlert size={17}/><span><b>Safety-first control</b><br/>Invalid transitions are blocked and penalized. Emergency stop turns off both simulated machines.</span></div>
        </section>
      </div>

      <div className="content-grid lower-grid">
        <section className="panel chart-panel"><div className="panel-head"><div><div className="panel-kicker">03 / MODEL PERFORMANCE</div><h2>Training Reward Trend</h2></div><span className="chart-legend"><i/> Average reward</span></div>
          <div className="chart-area">{chartData.length ? <ResponsiveContainer width="100%" height={220}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#263348"/><XAxis dataKey="episode" stroke="#8090a8" tickLine={false} axisLine={false}/><YAxis stroke="#8090a8" tickLine={false} axisLine={false}/><Tooltip contentStyle={{background:'#111c2d',border:'1px solid #34445c',borderRadius:8,color:'#eaf0fa'}}/><Bar dataKey="reward" fill="#53d6b0" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer> : <div className="empty-chart"><Activity size={26}/><span>Train the agent to generate the reward chart.</span></div>}</div>
        </section>
        <section className="panel log-panel"><div className="panel-head"><div><div className="panel-kicker">04 / EVENT STREAM</div><h2>Cell Activity Log</h2></div><span className="log-count">{cell?.events?.length || 0} events</span></div>
          <div className="event-list">{(cell?.events || ['Connecting to backend…']).slice().reverse().map((e,i)=><div className="event" key={`${e}-${i}`}><span className={`event-dot ${e.toLowerCase().includes('blocked') || e.toLowerCase().includes('emergency') ? 'warn' : ''}`}></span><span>{e}</span></div>)}</div>
        </section>
      </div>
      <section className="panel manual-panel"><div className="panel-head"><div><div className="panel-kicker">OPTIONAL / DEMONSTRATION MODE</div><h2>Teach by Demonstration</h2><p className="panel-description">Manually demonstrate a valid action sequence. The backend checks every action against the simulated machine state.</p></div></div>
        <div className="manual-actions">{actionList.map(([key,label])=><button key={key} className="manual-btn" disabled={busy || !cell || cell.done || cell.emergency_stop} onClick={()=>runTask('/api/manual-action',{method:'POST',body:JSON.stringify({action:key})},label+' demonstrated.')}>{label}</button>)}</div>
      </section>
      <footer><div><Factory size={17}/> CELL<span>AI</span></div><p>Educational digital-twin simulation · No physical machinery connected</p><span>React · FastAPI · Q-Learning</span></footer>
    </main>
  </div>;
}

function Metric({icon,label,value,foot}) { return <div className="metric-card"><div className="metric-icon">{icon}</div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-foot">{foot}</div></div>; }
