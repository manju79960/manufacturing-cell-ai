from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import random
import time

app = FastAPI(title="AI Manufacturing Cell API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict to your deployed frontend URL in production.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ACTIONS = ["load", "start_m1", "process_m1", "transfer", "start_m2", "process_m2", "unload"]
ACTION_LABELS = {
    "load": "Load workpiece",
    "start_m1": "Start Machine 1",
    "process_m1": "Process at Machine 1",
    "transfer": "Transfer to Machine 2",
    "start_m2": "Start Machine 2",
    "process_m2": "Process at Machine 2",
    "unload": "Unload finished product",
}
# State: (stage, machine1_on, machine2_on, emergency_stop)
# stage: 0 empty, 1 loaded, 2 m1 started, 3 m1 processed, 4 transferred,
#        5 m2 started, 6 m2 processed, 7 finished
class Cell:
    def __init__(self):
        self.reset()

    def reset(self):
        self.stage = 0
        self.m1_on = False
        self.m2_on = False
        self.emergency_stop = False
        self.events = ["Cell reset. Waiting for a workpiece."]
        self.steps = 0
        self.invalid_actions = 0
        self.safety_events = 0
        self.total_reward = 0.0
        self.done = False
        return self.snapshot()

    def snapshot(self):
        stage_names = ["Empty", "Loaded", "Machine 1 ready", "Machine 1 complete",
                       "Transferred", "Machine 2 ready", "Machine 2 complete", "Product complete"]
        return {
            "stage": self.stage,
            "stage_name": stage_names[self.stage],
            "m1_on": self.m1_on,
            "m2_on": self.m2_on,
            "emergency_stop": self.emergency_stop,
            "steps": self.steps,
            "invalid_actions": self.invalid_actions,
            "safety_events": self.safety_events,
            "total_reward": round(self.total_reward, 2),
            "done": self.done,
            "events": self.events[-12:],
            "available_actions": [] if self.emergency_stop or self.done else ACTIONS,
        }

    def step(self, action):
        if action not in ACTIONS:
            raise ValueError("Unknown action.")
        self.steps += 1
        if self.emergency_stop:
            self.safety_events += 1
            self.total_reward -= 5
            self.events.append("Safety block: emergency stop is active.")
            return -5.0, False, "Emergency stop is active; reset the cell to continue."
        if self.done:
            self.events.append("No operation: product is already complete.")
            return 0.0, True, "Product already complete."

        valid = {
            "load": self.stage == 0,
            "start_m1": self.stage == 1 and not self.m1_on,
            "process_m1": self.stage == 2 and self.m1_on,
            "transfer": self.stage == 3 and not self.m1_on and not self.m2_on,
            "start_m2": self.stage == 4 and not self.m2_on,
            "process_m2": self.stage == 5 and self.m2_on,
            "unload": self.stage == 6 and not self.m2_on,
        }
        if not valid[action]:
            self.invalid_actions += 1
            self.total_reward -= 2
            message = f"Blocked invalid action: {ACTION_LABELS[action]} is not safe for the current state."
            self.events.append(message)
            return -2.0, False, message

        reward = 1.0
        if action == "load":
            self.stage = 1
            message = "Workpiece loaded into the virtual cell."
        elif action == "start_m1":
            self.m1_on = True
            self.stage = 2
            message = "Machine 1 started."
        elif action == "process_m1":
            self.m1_on = False
            self.stage = 3
            reward = 5.0
            message = "Machine 1 processing completed."
        elif action == "transfer":
            self.stage = 4
            reward = 2.0
            message = "Workpiece transferred safely to Machine 2."
        elif action == "start_m2":
            self.m2_on = True
            self.stage = 5
            message = "Machine 2 started."
        elif action == "process_m2":
            self.m2_on = False
            self.stage = 6
            reward = 5.0
            message = "Machine 2 processing completed."
        else:
            self.stage = 7
            self.done = True
            reward = 20.0
            message = "Finished product unloaded. Production cycle complete!"
        self.total_reward += reward
        self.events.append(message)
        return reward, self.done, message

cell = Cell()
q_table = {}
training_summary = {"trained": False, "episodes": 0, "success_rate": 0.0, "avg_reward": 0.0}
training_log = []

def state_key(c):
    return (c.stage, int(c.m1_on), int(c.m2_on), int(c.emergency_stop))

def q_values(state):
    if state not in q_table:
        q_table[state] = {a: 0.0 for a in ACTIONS}
    return q_table[state]

def valid_actions_for_stage(stage):
    return {
        0: ["load"], 1: ["start_m1"], 2: ["process_m1"],
        3: ["transfer"], 4: ["start_m2"], 5: ["process_m2"], 6: ["unload"], 7: []
    }.get(stage, [])

def train_agent(episodes=500):
    global training_summary, training_log
    alpha, gamma = 0.25, 0.90
    epsilon = 0.35
    successes, rewards = 0, []
    training_log = []
    for ep in range(episodes):
        sim = Cell()
        total = 0.0
        for _ in range(12):
            s = state_key(sim)
            allowed = valid_actions_for_stage(sim.stage)
            if not allowed:
                break
            if random.random() < epsilon:
                action = random.choice(ACTIONS)
            else:
                values = q_values(s)
                action = max(ACTIONS, key=lambda a: values[a])
            old_stage = sim.stage
            reward, done, _ = sim.step(action)
            # A safety-aware agent learns that invalid actions are costly.
            ns = state_key(sim)
            next_allowed = valid_actions_for_stage(sim.stage)
            best_next = max([q_values(ns)[a] for a in next_allowed], default=0.0)
            old_q = q_values(s)[action]
            q_values(s)[action] = old_q + alpha * (reward + gamma * best_next - old_q)
            total += reward
            if done:
                successes += 1
                break
        rewards.append(total)
        if (ep + 1) % max(1, episodes // 20) == 0:
            training_log.append({"episode": ep + 1, "reward": round(sum(rewards[-max(1, episodes//20):]) / max(1, len(rewards[-max(1, episodes//20):])), 2)})
        epsilon = max(0.03, epsilon * 0.992)
    training_summary = {
        "trained": True, "episodes": episodes,
        "success_rate": round(100 * successes / episodes, 1),
        "avg_reward": round(sum(rewards) / len(rewards), 2),
        "q_states_learned": len(q_table),
    }
    return training_summary

def choose_agent_action():
    s = state_key(cell)
    allowed = valid_actions_for_stage(cell.stage)
    if not allowed:
        return None
    # Use the learned Q-values when available, otherwise safe action selection.
    values = q_values(s)
    return max(allowed, key=lambda a: values.get(a, 0.0))

class ActionRequest(BaseModel):
    action: str

class TrainRequest(BaseModel):
    episodes: int = 500

@app.get("/")
def root():
    return {"message": "AI Manufacturing Cell API is running", "docs": "/docs"}

@app.get("/api/status")
def status():
    return {"cell": cell.snapshot(), "training": training_summary, "action_labels": ACTION_LABELS}

@app.post("/api/reset")
def reset():
    cell.reset()
    return status()

@app.post("/api/train")
def train(req: TrainRequest):
    if not 10 <= req.episodes <= 5000:
        raise HTTPException(status_code=400, detail="Episodes must be between 10 and 5000.")
    result = train_agent(req.episodes)
    return {"training": result, "log": training_log}

@app.post("/api/step")
def step():
    if cell.emergency_stop:
        raise HTTPException(status_code=409, detail="Emergency stop is active. Reset before continuing.")
    action = choose_agent_action()
    if action is None:
        return {"cell": cell.snapshot(), "message": "No action needed; cycle is complete."}
    reward, done, message = cell.step(action)
    return {"cell": cell.snapshot(), "action": action, "action_label": ACTION_LABELS[action],
            "reward": reward, "done": done, "message": message}

@app.post("/api/manual-action")
def manual_action(req: ActionRequest):
    if req.action not in ACTIONS:
        raise HTTPException(status_code=400, detail="Unknown action.")
    reward, done, message = cell.step(req.action)
    return {"cell": cell.snapshot(), "action": req.action, "reward": reward, "done": done, "message": message}

@app.post("/api/emergency-stop")
def emergency_stop():
    cell.emergency_stop = True
    cell.m1_on = False
    cell.m2_on = False
    cell.safety_events += 1
    cell.events.append("EMERGENCY STOP activated. Both machines switched off.")
    return {"cell": cell.snapshot(), "message": "Emergency stop activated; machines are off."}

@app.get("/api/metrics")
def metrics():
    return {
        "training": training_summary,
        "cell": {
            "steps": cell.steps,
            "invalid_actions": cell.invalid_actions,
            "safety_events": cell.safety_events,
            "total_reward": round(cell.total_reward, 2),
            "completed": cell.done
        },
        "training_log": training_log,
    }
