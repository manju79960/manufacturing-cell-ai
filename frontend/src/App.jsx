import React, { useMemo, useState } from 'react';
import { Activity, Bot, Factory, Gauge, Play, RotateCcw, ShieldAlert, GraduationCap, CheckCircle2, AlertTriangle, Cpu, Workflow } from 'lucide-react';
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import './styles.css';

const ACTIONS = [
  { key: 'load', label: 'Load workpiece', from: 0, to: 1, reward: 1 },
  { key: 'start_m1', label: 'Start Machine 1', from: 1, to: 2, reward: 1 },
  { key: 'process_m1', label: 'Process at Machine 1', from: 2, to: 3, reward: 5 },
  { key: 'transfer', label: 'Transfer to Machine 2', from: 3, to: 4, reward: 2 },
  { key: 'start_m2', label: 'Start Machine 2', from: 4, to: 5, reward: 1 },
  { key: 'process_m2', label: 'Process at Machine 2', from: 5, to: 6, reward: 5 },
  { key: 'unload', label: 'Unload finished product', from: 6, to: 7, reward: 20 },
];
const STAGES = ['Empty', 'Loaded', 'Machine 1 ready', 'Machine 1 complete', 'Transferred', 'Machine 2 ready', 'Machine 2 complete', 'Product complete'];

function newCell() {
  return { stage: 0, m1: false, m2: false, emergency: false, steps: 0, invalid: 0, safety: 0, reward: 0, done: false, events: ['Cell reset. Waiting for a workpiece.'] };
}
function qTrain(episodes) {
  // Small tabular Q-learning environment; states represent the seven workflow stages.
  const q = Array.from({ length: 8 }, () => Array(ACTIONS.length).fill(0));
  const log = [];
  let successes = 0;
  const alpha = 0.25, gamma = 0.9;
  for (let ep = 1; ep <= episodes; ep++) {
    let state = 0, total = 0;
    let epsilon = Math.max(0.025, 0.8 * Math.pow(0.992, ep));
    for (let t = 0; t < 12 && state !== 7; t++) {
      let actionIndex;
      if (Math.random() < epsilon) actionIndex = Math.floor(Math.random() * ACTIONS.length);
      else actionIndex = q[state].indexOf(Math.max(...q[state]));
      const action = ACTIONS[actionIndex];
      const valid = action.from === state;
      const reward = valid ? action.reward : -2;
      const nextState = valid ? action.to : state;
      const bestNext = nextState === 7 ? 0 : Math.max(...q[nextState]);
      q[state][actionIndex] += alpha * (reward + gamma * bestNext - q[state][actionIndex]);
      total += reward;
      state = nextState;
    }
    if (state === 7) successes++;
    if (ep % Math.max(1, Math.floor(episodes / 20)) === 0) {
      log.push({ episode: ep, reward: Math.round(total * 100) / 100 });
    }
  }
  return { q, log, successRate: Math.round(successes / episodes * 1000) / 10, episodes };
}

export default function App() {
  const [cell, setCell] = useState(newCell);
  const [training, setTraining] = useState(null);
  const [episodes, setEpisodes] = useState(500);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [qTable, setQTable] = useState(null);

  const actionAllowed = (action) => !cell.emergency && !cell.done && action.from === cell.stage;
  const doAction = (action) => {
    if (cell.emergency || cell.done) return;
    const valid = action.from === cell.stage;
    if (!valid) {
      setCell(c => ({ ...c, steps: c.steps + 1, invalid: c.invalid + 1, reward: c.reward - 2, events: [...c.events, `Blocked invalid action: ${action.label}. Safety rule applied.`].slice(-20) }));
      setNotice(`Blocked: ${action.label} is not valid at this stage.`);
      return;
    }
    const done = action.to === 7;
    const m1 = action.to === 2 ? true : action.to === 3 ? false : cell.m1;
    const m2 = action.to === 5 ? true : action.to === 6 ? false : cell.m2;
    setCell(c => ({ ...c, stage: action.to, m1, m2, steps: c.steps + 1, reward: c.reward + action.reward, done, events: [...c.events, `${action.label} — reward +${action.reward}.`].slice(-20) }));
    setNotice(done ? 'Production cycle complete!' : `${action.label} completed.`);
  };
  const runAI = () => {
    if (cell.emergency || cell.done) return;
    const action = ACTIONS.find(a => a.from === cell.stage);
    if (action) doAction(action);
  };
  const train = () => {
    setBusy(true);
    // Keep training local to the browser; no server/API is required.
    window.setTimeout(() => {
      const result = qTrain(episodes);
      setTraining(result);
      setQTable(result.q);
      setBusy(false);
      setNotice(`Training complete: ${episodes} episodes simulated in your browser.`);
    }, 20);
  };
  const reset = () => { setCell(newCell()); setNotice('Manufacturing cell reset.'); };
  const stop = () => {
    setCell(c => ({ ...c, emergency: true, m1: false, m2: false, safety: c.safety + 1, events: [...c.events, 'EMERGENCY STOP activated. Both simulated machines switched off.'].slice(-20) }));
    setNotice('Emergency stop activated. Reset the cell to continue.');
  };
  const runLearned = () => {
    if (!qTable || cell.done || cell.emergency) { runAI(); return; }
    const allowed = ACTIONS.filter(a => a.from === cell.stage);
    if (!allowed.length) return;
    // Choose the highest-Q valid action for this state, preserving the state-machine safety check.
    const q = qTable[cell.stage];
    const action = allowed.reduce((best, a) => q[ACTIONS.indexOf(a)] > q[ACTIONS.indexOf(best)] ? a : best, allowed[0]);
    doAction(action);
  };

  const chartData = training?.log || [];
  const status = cell.emergency ? 'Emergency stop' : cell.done ? 'Cycle complete' : 'Simulation ready';

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-icon"><Factory size={23}/></div><div><div className="brand-title">CELL<span>AI</span></div><div className="brand-subtitle">INTELLIGENT MANUFACTURING SIMULATOR</div></div></div>
      <div className="top-status"><span className={`status-dot ${cell.emergency ? 'danger' : ''}`}></span>{status}<span className="version">BROWSER MODE · GITHUB PAGES</span></div>
    </header>
    <main className="main">
      <section className="hero"><div><div className="eyebrow"><span className="eyebrow-line"></span> REINFORCEMENT LEARNING LAB</div><h1>Teaching an AI Agent to<br/><span>Operate a Manufacturing Cell</span></h1><p>Train a browser-based learning agent to complete a production workflow while respecting machine states and safety constraints.</p></div><div className="hero-mark"><Bot size={66} strokeWidth={1.15}/><span>AI AGENT<br/>IN BROWSER</span></div></section>
      {notice && <div className="alert success"><CheckCircle2 size={18}/>{notice}</div>}
      <section className="metrics-grid">
        <Metric icon={<Gauge/>} label="TOTAL REWARD" value={cell.reward} foot="Current production episode"/>
        <Metric icon={<Workflow/>} label="PROCESS STEPS" value={cell.steps} foot="Actions attempted"/>
        <Metric icon={<ShieldAlert/>} label="INVALID ACTIONS" value={cell.invalid} foot="Blocked by safety rules"/>
        <Metric icon={<GraduationCap/>} label="TRAINING SUCCESS" value={training ? `${training.successRate}%` : 'Not trained'} foot={training ? `${training.episodes} training episodes` : 'Train the agent below'}/>
      </section>
      <div className="content-grid">
        <section className="panel cell-panel">
          <div className="panel-head"><div><div className="panel-kicker">01 / DIGITAL TWIN</div><h2>Virtual Manufacturing Cell</h2></div><span className="live-pill"><span/> LIVE STATE</span></div>
          <div className="factory-floor">
            <div className={`machine ${cell.m1 ? 'running' : ''} ${cell.stage >= 3 ? 'complete' : ''}`}><div className="machine-number">01</div><Cpu size={35}/><b>Machine 1</b><span className="machine-state">{cell.m1 ? 'RUNNING' : cell.stage >= 3 ? 'COMPLETE' : 'STANDBY'}</span></div>
            <div className="conveyor"><div className={`workpiece ${cell.stage > 0 && cell.stage < 7 ? 'visible' : ''} ${cell.stage >= 4 ? 'moved' : ''}`}></div><div className="belt"></div><span>TRANSFER LINE</span></div>
            <div className={`machine ${cell.m2 ? 'running' : ''} ${cell.stage >= 6 ? 'complete' : ''}`}><div className="machine-number">02</div><Cpu size={35}/><b>Machine 2</b><span className="machine-state">{cell.m2 ? 'RUNNING' : cell.stage >= 6 ? 'COMPLETE' : 'STANDBY'}</span></div>
          </div>
          <div className="stage-block"><div className="stage-top"><span>PRODUCTION WORKFLOW</span><b>{cell.stage}/7</b></div><div className="progress-track"><div style={{width:`${cell.stage/7*100}%`}}/></div><div className="stage-name">{STAGES[cell.stage]}</div><div className="steps-row">{['Load','Start M1','Process','Transfer','Start M2','Process','Unload'].map((s,i)=><div key={s} className={`step-chip ${cell.stage>i?'done':cell.stage===i?'active':''}`}><span>{i+1}</span>{s}</div>)}</div></div>
          <div className="panel-actions"><button className="btn primary" disabled={cell.done || cell.emergency} onClick={runLearned}><Play size={16} fill="currentColor"/> Run AI Step</button><button className="btn secondary" onClick={reset}><RotateCcw size={16}/> Reset Cell</button><button className="btn danger-btn" disabled={cell.emergency} onClick={stop}><ShieldAlert size={16}/> Emergency Stop</button></div>
        </section>
        <section className="panel agent-panel">
          <div className="panel-head"><div><div className="panel-kicker">02 / LEARNING SYSTEM</div><h2>AI Agent Control</h2></div><div className="agent-avatar"><Bot size={25}/></div></div>
          <div className="agent-status"><div className="pulse-icon"><Activity size={22}/></div><div><b>{training ? 'Agent trained' : 'Agent awaiting training'}</b><span>{training ? `${training.episodes} episodes learned in browser` : 'Train to generate Q-values'}</span></div><span className={`status-tag ${training ? 'trained' : ''}`}>{training ? 'TRAINED' : 'UNTRAINED'}</span></div>
          <label className="field-label" htmlFor="episodes">Training episodes <b>{episodes}</b></label><input id="episodes" type="range" min="100" max="2000" step="100" value={episodes} onChange={e=>setEpisodes(Number(e.target.value))}/><div className="range-labels"><span>100 episodes</span><span>2000 episodes</span></div>
          <button className="btn primary full" disabled={busy} onClick={train}><GraduationCap size={17}/>{busy ? 'Training in browser…' : 'Train AI Agent'}</button>
          <div className="agent-stats"><div><span>Average reward</span><b>{training ? (training.log.reduce((s,x)=>s+x.reward,0)/Math.max(1,training.log.length)).toFixed(1) : '—'}</b></div><div><span>Learned states</span><b>{training ? 8 : '—'}</b></div><div><span>Safety events</span><b>{cell.safety}</b></div></div>
          <div className="note"><ShieldAlert size={17}/><span><b>Safety-first simulation</b><br/>Invalid transitions are blocked and penalized. Emergency stop switches off both simulated machines.</span></div>
        </section>
      </div>
      <div className="content-grid lower-grid">
        <section className="panel chart-panel"><div className="panel-head"><div><div className="panel-kicker">03 / MODEL PERFORMANCE</div><h2>Training Reward Trend</h2></div><span className="chart-legend"><i/> Training reward</span></div><div className="chart-area">{chartData.length ? <ResponsiveContainer width="100%" height={220}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#263348"/><XAxis dataKey="episode" stroke="#8090a8" tickLine={false} axisLine={false}/><YAxis stroke="#8090a8" tickLine={false} axisLine={false}/><Tooltip contentStyle={{background:'#111c2d',border:'1px solid #34445c',borderRadius:8,color:'#eaf0fa'}}/><Bar dataKey="reward" fill="#53d6b0" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer> : <div className="empty-chart"><Activity size={26}/><span>Train the agent to generate the reward chart.</span></div>}</div></section>
        <section className="panel log-panel"><div className="panel-head"><div><div className="panel-kicker">04 / EVENT STREAM</div><h2>Cell Activity Log</h2></div><span className="log-count">{cell.events.length} events</span></div><div className="event-list">{cell.events.slice().reverse().map((e,i)=><div className="event" key={`${e}-${i}`}><span className={`event-dot ${e.toLowerCase().includes('blocked') || e.toLowerCase().includes('emergency') ? 'warn' : ''}`}></span><span>{e}</span></div>)}</div></section>
      </div>
      <section className="panel manual-panel"><div className="panel-head"><div><div className="panel-kicker">OPTIONAL / DEMONSTRATION MODE</div><h2>Teach by Demonstration</h2><p className="panel-description">Demonstrate an operation manually. Every action is checked against the simulated machine state.</p></div></div><div className="manual-actions">{ACTIONS.map(a=><button key={a.key} className="manual-btn" disabled={!actionAllowed(a)} onClick={()=>doAction(a)}>{a.label}</button>)}</div></section>
      <footer><div><Factory size={17}/> CELL<span>AI</span></div><p>Educational browser-based digital-twin simulation · No physical machinery connected</p><span>React · JavaScript · Q-Learning</span></footer>
    </main>
  </div>;
}
function Metric({icon,label,value,foot}) { return <div className="metric-card"><div className="metric-icon">{icon}</div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-foot">{foot}</div></div>; }
