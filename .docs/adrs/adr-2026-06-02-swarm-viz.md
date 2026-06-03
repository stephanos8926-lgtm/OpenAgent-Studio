# ADR: Swarm Visualization and Interaction Mesh

## Context
As the DeepAgent IDE scales into a multi-agent system (Swarm), the orchestrator-to-agent communication has become opaque. The user lacks visibility into which sub-agent is active, what task queue they are processing, and the real-time health of the swarm.

## Decision
We will implement a high-fidelity 'Swarm Radar' visual dashboard. This interface component maps structural LangGraph nodes to real-time UI elements in the browser, providing bidirectional visualization of:
1. Active agent state (execution/standby)
2. Task throughput per agent
3. Real-time sub-agent task queues (via interactive toggles)
4. Telemetry coherence monitoring

## Consequences
- **Positive:**
  - Dramatically improves user trust by visualizing agent internal state.
  - Allows direct, UI-driven introspection of swarm task queues.
  - Simplifies debugging agent-agent communication gaps.
- **Negative:**
  - Increases UI complexity in the dashboard.
  - Adds minor overhead to the frontend React render cycle.
  - Requires syncing LangGraph node state to the Client Store in near-real-time.

## Alternatives Rejected
1. **Raw Log Inspection:** Unstructured and impossible for a user to parse during rapid swarm execution.
2. **Terminal-only status lines:** Confusing to users not familiar with PTY streams; lacks the structural relationship visualization (e.g., orchestrator -> planner flow).
3. **No UI Feedback:** Would relegate the IDE to a "black box," severely limiting appeal in a competitive landscape against visual generators like v0/Bolt.
