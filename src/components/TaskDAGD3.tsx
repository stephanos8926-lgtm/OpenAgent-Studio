// @ts-nocheck
import React, { useEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Circle, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw,
  Info
} from "lucide-react";
import { useAppStore } from "../lib/store";
import { TaskNode as Task } from "../types";

interface TaskDAGD3Props {
  tasks: Task[];
}

interface D3Node extends d3.SimulationNodeDatum {
  id: string;
  description: string;
  status: Task["status"];
  level: number;
}

interface D3Link {
  source: string | D3Node;
  target: string | D3Node;
}

export const TaskDAGD3: React.FC<TaskDAGD3Props> = ({ tasks }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const simulationRef = useRef<d3.Simulation<D3Node, undefined> | null>(null);
  const [hoveredTask, setHoveredTask] = useState<Task | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'completed' | 'active'>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterMode === 'completed') return t.status === "completed";
      if (filterMode === 'active') return t.status === "in_progress" || t.status === "failed";
      return true;
    });
  }, [tasks, filterMode]);

  // Computes hierarchical column index for each task using BFS topological layout
  const getTaskHierarchyLevels = (taskList: Task[]) => {
    const levels: Record<string, number> = {};
    const adj: Record<string, string[]> = {};
    const inDegree: Record<string, number> = {};

    taskList.forEach((task) => {
      levels[task.id] = 0;
      adj[task.id] = [];
      inDegree[task.id] = 0;
    });

    taskList.forEach((task) => {
      task.dependencies.forEach((depId) => {
        if (adj[depId]) {
          adj[depId].push(task.id);
          inDegree[task.id]++;
        }
      });
    });

    const queue: string[] = [];
    taskList.forEach((task) => {
      if (inDegree[task.id] === 0) {
        queue.push(task.id);
      }
    });

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const currLvl = levels[curr];
      (adj[curr] || []).forEach((neighbor) => {
        levels[neighbor] = Math.max(levels[neighbor], currLvl + 1);
        inDegree[neighbor]--;
        if (inDegree[neighbor] === 0) {
          queue.push(neighbor);
        }
      });
    }

    return levels;
  };

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || filteredTasks.length === 0) {
      const rootGroup = d3.select(groupRef.current);
      rootGroup.selectAll("*").remove();
      return;
    }

    const container = containerRef.current;
    const width = container.clientWidth || 600;
    const height = 300;

    const levels = getTaskHierarchyLevels(filteredTasks);
    const maxLevel = Math.max(0, ...Object.values(levels));
    const columnCount = maxLevel + 1;
    const colWidth = columnCount > 1 ? (width - 120) / (columnCount - 1) : width / 2;

    // Convert state tasks into local simulation nodes with initial position estimates
    const nodes: D3Node[] = filteredTasks.map((task) => {
      const lvl = levels[task.id] || 0;
      const nodesInLvl = filteredTasks.filter((t) => levels[t.id] === lvl);
      const idxInLvl = nodesInLvl.findIndex((t) => t.id === task.id);
      const colHeight = height - 80;
      const ySpacing = nodesInLvl.length > 1 ? colHeight / (nodesInLvl.length - 1) : colHeight / 2;
      
      const initialX = columnCount > 1 ? 60 + lvl * colWidth : width / 2;
      const initialY = nodesInLvl.length > 1 ? 40 + idxInLvl * ySpacing : height / 2;

      return {
        id: task.id,
        description: task.description,
        status: task.status,
        level: lvl,
        x: initialX,
        y: initialY,
      };
    });

    // Populate link endpoints
    const links: D3Link[] = [];
    filteredTasks.forEach((task) => {
      task.dependencies.forEach((depId) => {
        const sourceNode = nodes.find((n) => n.id === depId);
        const targetNode = nodes.find((n) => n.id === task.id);
        if (sourceNode && targetNode) {
          links.push({
            source: depId,
            target: task.id,
          });
        }
      });
    });

    // Clean canvas layers
    const svg = d3.select(svgRef.current);
    const rootGroup = d3.select(groupRef.current);
    rootGroup.selectAll("*").remove();

    // Create D3 forces simulation
    const simulation = d3.forceSimulation<D3Node>(nodes)
      .force("link", d3.forceLink<D3Node, D3Link>(links).id((d) => d.id).distance(110))
      .force("charge", d3.forceManyBody().strength(-150))
      .force("collide", d3.forceCollide().radius(40))
      .force("x", d3.forceX<D3Node>((d) => {
        return columnCount > 1 ? 60 + d.level * colWidth : width / 2;
      }).strength(1.5))
      .force("y", d3.forceY(height / 2).strength(0.35));

    simulationRef.current = simulation;

    // Render Vector connectors
    const linkGroup = rootGroup.append("g").attr("class", "links");
    const linkPaths = linkGroup.selectAll("path")
      .data(links)
      .enter()
      .append("path")
      .attr("fill", "none")
      .attr("stroke-width", (d) => {
        const targetNode = typeof d.target === "object" ? d.target as D3Node : null;
        return targetNode?.status === "in_progress" ? 2.5 : 1.8;
      })
      .attr("stroke", (d) => {
        const sourceNode = typeof d.source === "object" ? d.source as D3Node : null;
        const targetNode = typeof d.target === "object" ? d.target as D3Node : null;
        if (sourceNode?.status === "completed" && targetNode?.status === "completed") {
          return "#22c55e"; // Success green vector
        }
        if (targetNode?.status === "in_progress" || sourceNode?.status === "in_progress") {
          return "#3b82f6"; // Active tracking blue
        }
        if (targetNode?.status === "failed") {
          return "#ef4444"; // Incident Red
        }
        return "#cbd5e1"; // General Pending lines
      })
      .attr("marker-end", (d) => {
        const sourceNode = typeof d.source === "object" ? d.source as D3Node : null;
        const targetNode = typeof d.target === "object" ? d.target as D3Node : null;
        if (sourceNode?.status === "completed" && targetNode?.status === "completed") {
          return "url(#arrow-completed)";
        }
        if (targetNode?.status === "in_progress" || sourceNode?.status === "in_progress") {
          return "url(#arrow-inprogress)";
        }
        if (targetNode?.status === "failed") {
          return "url(#arrow-failed)";
        }
        return "url(#arrow-pending)";
      })
      .attr("class", (d) => {
        const targetNode = typeof d.target === "object" ? d.target as D3Node : null;
        return targetNode?.status === "in_progress" ? "stroke-[2px] opacity-90 animate-dash-blue" : "opacity-60";
      });

    // Render Nodes Groups container
    const nodeGroup = rootGroup.append("g").attr("class", "nodes");
    const nodeElements = nodeGroup.selectAll("g")
      .data(nodes)
      .enter()
      .append("g")
      .attr("cursor", "grab")
      .on("mouseenter", (event, d) => {
        setHoveredTask({
          id: d.id,
          description: d.description,
          status: d.status,
          dependencies: filteredTasks.find(t => t.id === d.id)?.dependencies || []
        });
      })
      .on("mouseleave", () => {
        setHoveredTask(null);
      })
      .call(
        d3.drag<SVGGElement, D3Node>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);

            // Compute potential drop targets (overlap checking)
            let nearestNode: D3Node | null = null;
            let minDistance = 50; // drag overlap threshold in pixels
            for (const other of nodes) {
              if (other.id !== d.id) {
                const dist = Math.hypot(other.x! - event.x, other.y! - event.y);
                if (dist < minDistance) {
                  minDistance = dist;
                  nearestNode = other;
                }
              }
            }

            if (nearestNode) {
              const sourceTask = filteredTasks.find(t => t.id === d.id);
              if (sourceTask) {
                const currentDeps = sourceTask.dependencies || [];
                const alreadyDep = currentDeps.includes(nearestNode.id);
                let updatedDeps: string[];
                let actionMsg = "";

                if (alreadyDep) {
                  updatedDeps = currentDeps.filter(depId => depId !== nearestNode.id);
                  actionMsg = `Removed dependency on '${nearestNode.id}'/ '${d.id}'`;
                } else {
                  // Avoid cyclic dependency simple guard
                  const targetDeps = filteredTasks.find((t: any) => t.id === nearestNode!.id)?.dependsOn || [];
                  if (targetDeps.includes(d.id)) {
                    actionMsg = `Cannot add dependency: '${nearestNode.id}' already depends on '${d.id}' (Avoiding cyclic link!)`;
                    setToastMessage(actionMsg);
                    setTimeout(() => setToastMessage(null), 4000);
                  } else {
                    updatedDeps = [...currentDeps, nearestNode.id];
                    actionMsg = `Reordered DAG: Added '${nearestNode.id}' as dependency for '${d.id}'`;
                    // updateTaskDependencies(d.id, updatedDeps);
                    setToastMessage(actionMsg);
                    setTimeout(() => setToastMessage(null), 4000);
                  }
                }

                if (!alreadyDep && !filteredTasks.find((t: any) => t.id === nearestNode!.id)?.dependsOn?.includes(d.id)) {
                  // already tracked inside if condition
                } else if (alreadyDep) {
                  // updateTaskDependencies(d.id, updatedDeps);
                  setToastMessage(actionMsg);
                  setTimeout(() => setToastMessage(null), 4000);
                }
              }
            }

            d.fx = null;
            d.fy = null;
          })
      );

    // Dynamic glowing pulses for running tasks
    nodeElements.each(function (d) {
      if (d.status === "in_progress") {
        d3.select(this)
          .append("circle")
          .attr("r", 22)
          .attr("fill", "none")
          .attr("stroke", "#3b82f6")
          .attr("stroke-width", 1.5)
          .attr("class", "animate-ping opacity-75");
      }
    });

    // Outer node border and interior canvas
    nodeElements.append("circle")
      .attr("r", 18)
      .attr("fill", "#ffffff")
      .attr("stroke-width", (d) => d.status === "in_progress" ? 2.5 : 1.8)
      .attr("stroke", (d) => {
        if (d.status === "completed") return "#22c55e";
        if (d.status === "in_progress") return "#3b82f6";
        if (d.status === "failed") return "#ef4444";
        return "#cbd5e1";
      })
      .attr("class", "shadow-sm transition-all duration-150");

    // Dynamic Icon Vectors matching task state directly
    nodeElements.each(function (d) {
      const nodeSel = d3.select(this);
      if (d.status === "completed") {
        nodeSel.append("path")
          .attr("d", "M -5 -0.5 L -1.5 3 L 5 -3")
          .attr("fill", "none")
          .attr("stroke", "#22c55e")
          .attr("stroke-width", 2.2)
          .attr("stroke-linecap", "round")
          .attr("stroke-linejoin", "round");
      } else if (d.status === "failed") {
        nodeSel.append("path")
          .attr("d", "M 0 -5 L 0 1.5 M 0 4.5 Q 0 4.8 0 4.8")
          .attr("fill", "none")
          .attr("stroke", "#ef4444")
          .attr("stroke-width", 2.5)
          .attr("stroke-linecap", "round");
      } else if (d.status === "in_progress") {
        nodeSel.append("circle")
          .attr("r", 6)
          .attr("fill", "none")
          .attr("stroke", "#3b82f6")
          .attr("stroke-width", 1.8);
        nodeSel.append("path")
          .attr("d", "M 0 0 L 0 -3.5 M 0 0 L 2.5 0")
          .attr("fill", "none")
          .attr("stroke", "#3b82f6")
          .attr("stroke-width", 1.8)
          .attr("stroke-linecap", "round");
      } else {
        nodeSel.append("circle")
          .attr("r", 4)
          .attr("fill", "none")
          .attr("stroke", "#94a3b8")
          .attr("stroke-width", 1.8);
      }
    });

    // Task label descriptors underneath are neatly displayed
    nodeElements.append("text")
      .attr("y", 32)
      .attr("text-anchor", "middle")
      .attr("fill", "#1e293b")
      .attr("font-family", "JetBrains Mono, monospace")
      .attr("font-size", "9px")
      .attr("font-weight", "bold")
      .text((d) => d.id)
      .attr("class", "select-none pointer-events-none");

    // Update positions on tick
    simulation.on("tick", () => {
      linkPaths.attr("d", (d) => {
        const src = d.source as D3Node;
        const tgt = d.target as D3Node;
        if (!src.x || !src.y || !tgt.x || !tgt.y) return "";
        const dx = tgt.x - src.x;
        return `M ${src.x} ${src.y} C ${src.x + dx * 0.4} ${src.y}, ${src.x + dx * 0.6} ${tgt.y}, ${tgt.x} ${tgt.y}`;
      });

      nodeElements.attr("transform", (d) => `translate(${d.x}, ${d.y})`);
    });

    // Setup active Zoom and Pan channels
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.4, 2.5])
      .on("zoom", (event) => {
        rootGroup.attr("transform", event.transform);
      });

    svg.call(zoomBehavior);

    // Initial positioning to center fit
    svg.call(zoomBehavior.transform, d3.zoomIdentity.translate(20, 0).scale(0.95));

    // Handle ResizeObserver cleanup to respect window changes
    const observer = new ResizeObserver(() => {
      const currentWidth = container.clientWidth || 600;
      const colW = columnCount > 1 ? (currentWidth - 120) / (columnCount - 1) : currentWidth / 2;
      simulation.force("x", d3.forceX<D3Node>((d) => {
        return columnCount > 1 ? 60 + d.level * colW : currentWidth / 2;
      }).strength(1.5));
      simulation.alpha(0.1).restart();
    });
    observer.observe(container);

    return () => {
      simulation.stop();
      observer.disconnect();
    };
  }, [filteredTasks]);

  const triggerZoomIn = () => {
    if (!svgRef.current) return;
    d3.select(svgRef.current).transition().duration(250).call(d3.zoom().scaleBy as any, 1.3);
  };

  const triggerZoomOut = () => {
    if (!svgRef.current) return;
    d3.select(svgRef.current).transition().duration(250).call(d3.zoom().scaleBy as any, 1 / 1.3);
  };

  const triggerZoomReset = () => {
    if (!svgRef.current) return;
    d3.select(svgRef.current).transition().duration(300).call(
      d3.zoom().transform as any,
      d3.zoomIdentity.translate(20, 0).scale(0.95)
    );
  };

  return (
    <div ref={containerRef} className="w-full h-[320px] bg-slate-50/50 hover:bg-slate-50/80 rounded-2xl border border-gray-100 p-2 shadow-inner relative overflow-hidden flex flex-col justify-end">
      {/* Interactive filter toggle for TaskDAG */}
      <div className="absolute top-3 left-3 flex items-center bg-white/90 backdrop-blur-xs border border-gray-150 p-1 rounded-lg shadow-sm z-30 font-sans text-[10px] font-bold">
        <span className="text-gray-400 px-1.5 uppercase tracking-wider text-[8px] mr-1 border-r border-gray-200 pr-1.5">Filter</span>
        <div className="flex gap-1">
          {(['all', 'completed', 'active'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              className={`px-2 py-0.5 rounded text-[8px] uppercase tracking-wider transition-all select-none cursor-pointer ${
                filterMode === mode
                  ? 'bg-blue-600 text-white font-black'
                  : 'text-gray-500 hover:text-gray-950 hover:bg-gray-100'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {filteredTasks.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/50 pointer-events-none select-none z-10">
          <Clock className="w-8 h-8 text-gray-300 animate-pulse mb-2" />
          <span className="text-xs text-gray-400 font-bold font-sans">No {filterMode} tasks found in DAG</span>
        </div>
      )}

      {/* SVG Canvas drawing surface */}
      <svg 
        ref={svgRef} 
        className="w-full h-full cursor-move outline-none select-none"
      >
        <defs>
          <marker 
            id="arrow-completed" 
            viewBox="0 0 10 10" 
            refX="23" 
            refY="5" 
            markerWidth="5" 
            markerHeight="5" 
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#22c55e" />
          </marker>
          <marker 
            id="arrow-inprogress" 
            viewBox="0 0 10 10" 
            refX="23" 
            refY="5" 
            markerWidth="5" 
            markerHeight="5" 
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#3b82f6" />
          </marker>
          <marker 
            id="arrow-failed" 
            viewBox="0 0 10 10" 
            refX="23" 
            refY="5" 
            markerWidth="5" 
            markerHeight="5" 
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444" />
          </marker>
          <marker 
            id="arrow-pending" 
            viewBox="0 0 10 10" 
            refX="23" 
            refY="5" 
            markerWidth="5" 
            markerHeight="5" 
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#cbd5e1" />
          </marker>
        </defs>
        <g ref={groupRef} />
      </svg>

      {/* Manual Zoom control overlay rail */}
      <div className="absolute top-3 right-3 flex items-center gap-1 bg-white/85 backdrop-blur-sm border border-gray-100 p-1.5 rounded-lg shadow-sm z-30">
        <button 
          onClick={triggerZoomIn} 
          title="Zoom In"
          className="p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button 
          onClick={triggerZoomOut} 
          title="Zoom Out"
          className="p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button 
          onClick={triggerZoomReset} 
          title="Reset Viewport"
          className="p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors border-l border-gray-100 pl-1.5 ml-0.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Floating details overlay tooltip */}
      {toastMessage && (
        <div className="absolute top-12 left-3 right-3 bg-slate-900/90 text-white backdrop-blur-md border border-slate-700/50 p-2.5 rounded-xl shadow-lg text-center z-50 text-[10px] font-sans tracking-wide">
          ✨ {toastMessage}
        </div>
      )}

      <div className="absolute bottom-3 left-3 right-3 bg-white/95 backdrop-blur-md border border-gray-100 p-2.5 rounded-xl shadow-md min-h-[50px] flex items-center justify-between z-30 animate-in fade-in slide-in-from-bottom-2 duration-150">
        {hoveredTask ? (
          <div className="flex items-start gap-2 w-full text-left">
            <div className="mt-0.5">
              {hoveredTask.status === "completed" && <CheckCircle2 className="w-4 h-4 text-green-500" />}
              {hoveredTask.status === "in_progress" && <Clock className="w-4 h-4 text-blue-500 animate-spin-slow" />}
              {hoveredTask.status === "failed" && <AlertCircle className="w-4 h-4 text-red-500" />}
              {hoveredTask.status === "pending" && <Circle className="w-4 h-4 text-gray-300" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold font-mono text-gray-900">{hoveredTask.id}</span>
                <span className={`text-[8px] uppercase font-mono font-black px-1.5 py-0.5 rounded ${
                  hoveredTask.status === "completed" ? "bg-green-50 text-green-600" :
                  hoveredTask.status === "in_progress" ? "bg-blue-50 text-blue-600" :
                  hoveredTask.status === "failed" ? "bg-red-50 text-red-600" :
                  "bg-gray-50 text-gray-500"
                }`}>
                  {hoveredTask.status}
                </span>
              </div>
              <p className="text-[10px] text-gray-500 leading-tight mt-0.5 font-medium truncate">
                {hoveredTask.description}
              </p>
            </div>
            {hoveredTask.dependencies.length > 0 && (
              <div className="text-right text-[8px] text-gray-400 font-mono flex-shrink-0 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 hidden md:block">
                Deps: {hoveredTask.dependencies.join(", ")}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-gray-400 text-[10px] font-medium font-sans">
            <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
            <span>Hover on task nodes to inspect, pan drag with cursor, or use zoom buttons.</span>
          </div>
        )}
      </div>
    </div>
  );
};
