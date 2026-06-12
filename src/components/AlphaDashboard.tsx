// File: src/components/AlphaDashboard.tsx

import React from 'react';
import { Rocket, GitBranch, Terminal, Cpu, Bug, ChevronRight } from 'lucide-react';

export const AlphaDashboard: React.FC = () => {
  return (
    <div id="alpha-dashboard-root" className="h-full flex flex-col justify-center items-center bg-slate-950 p-8 rounded-2xl border border-slate-800">
      <div className="max-w-2xl text-center space-y-6">
        <div className="mx-auto w-20 h-20 bg-blue-950/50 rounded-3xl border border-blue-500/20 flex items-center justify-center">
          <Rocket className="w-10 h-10 text-blue-400" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-4xl font-black text-white tracking-tight">DeepAgent Alpha v0.1</h1>
          <p className="text-slate-400 text-lg">Your autonomous coding swarm is initialized. Connect your IDE and start building.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
          <DashboardCard 
            icon={<GitBranch className="w-5 h-5 text-emerald-400" />}
            title="Project Status"
            description="All systems nominal. Agent Workspace active."
          />
          <DashboardCard 
            icon={<Terminal className="w-5 h-5 text-amber-400" />}
            title="Terminal Ready"
            description="Interactive PTY shell fully initialized."
          />
          <DashboardCard 
            icon={<Cpu className="w-5 h-5 text-blue-400" />}
            title="Agentic Swarm"
            description="Planner, Coder, Auditor nodes online."
          />
          <DashboardCard 
            icon={<Bug className="w-5 h-5 text-purple-400" />}
            title="Workflow Logs"
            description="Real-time coherence monitoring active."
          />
        </div>

      </div>
    </div>
  );
};

interface DashboardCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const DashboardCard: React.FC<DashboardCardProps> = ({ icon, title, description }) => (
  <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl text-left hover:border-slate-700 transition-colors">
    <div className="mb-3">{icon}</div>
    <h3 className="text-sm font-bold text-slate-100">{title}</h3>
    <p className="text-xs text-slate-500 mt-1">{description}</p>
  </div>
);
