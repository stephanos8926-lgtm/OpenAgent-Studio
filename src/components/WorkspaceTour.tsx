import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, Compass, ChevronRight, ChevronLeft, Bot, 
  Code2, Terminal, Shield, HelpCircle, CheckCircle2 
} from "lucide-react";

interface TourStep {
  title: string;
  description: string;
  icon: React.ReactNode;
  selector?: string; // Optional target highlight class selectors
  position: "center" | "top" | "right" | "bottom" | "left";
}

export const WorkspaceTour: React.FC = () => {
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(0);

  useEffect(() => {
    // If the tour was never started, show it automatically on first load!
    const tourStatus = localStorage.getItem("has_seen_workspace_tour");
    if (!tourStatus) {
      // Delay visual start slightly for transition aesthetics
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  // Set up listeners for the command palette to easily restart the tour
  useEffect(() => {
    const handleRestartTour = () => {
      setCurrentStep(0);
      setIsVisible(true);
    };
    window.addEventListener("restart-workspace-tour", handleRestartTour);
    return () => window.removeEventListener("restart-workspace-tour", handleRestartTour);
  }, []);

  const steps: TourStep[] = [
    {
      title: "Welcome to OpenAgent Studio",
      description: "Welcome to your high-performance multi-agent development terminal. We've equipped this workspace with concurrent sub-agents to develop, edit, audit, and secure system files autonomously for you.",
      icon: <Compass className="w-8 h-8 text-blue-400" />,
      position: "center"
    },
    {
      title: "Self-Coordinating Copilot Chat",
      description: "Submit goals or prompts here. An Orchestrator first checks the task's complexity: simple tasks get applied to files directly. Complex instructions trigger parallel sub-agents (Strategic Planner, Code Generator, and Auditor) with strict file locks to prevent race conditions.",
      icon: <Bot className="w-8 h-8 text-indigo-400" />,
      position: "right"
    },
    {
      title: "Virtual Filesystem Workspace Editor",
      description: "Examine, read, and write components. Changes can either be proposed in exact multi-chunk diffs for manual review, or written instantly in YOLO execution mode.",
      icon: <Code2 className="w-8 h-8 text-sky-400" />,
      position: "center"
    },
    {
      title: "Terminal & Telemetry logs HUD",
      description: "Observe active compilation pipelines, terminal run commands, and telemetry logs. If any sub-agent fails compile steps, the Platform Self-Repair agent intervenes automatically.",
      icon: <Terminal className="w-8 h-8 text-red-400" />,
      position: "bottom"
    },
    {
      title: "Header Status & Resource Monitor",
      description: "Monitor sandboxed container CPU averages, RAM metrics, system status, and active file Locks in real-time. Click active locks to view which sub-agent currently owns files.",
      icon: <Shield className="w-8 h-8 text-emerald-400" />,
      position: "top"
    }
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem("has_seen_workspace_tour", "true");
    setIsVisible(false);
  };

  if (!isVisible) return null;

  const step = steps[currentStep];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 w-full h-full bg-slate-950/70 backdrop-blur-xs z-[10000] flex items-center justify-center p-4">
        {/* Soft highlight guide circle for focal points */}
        {currentStep === 1 && (
          <div className="absolute top-12 right-4 bottom-12 w-[340px] md:w-[380px] border-2 border-indigo-500/40 rounded-2xl animate-pulse pointer-events-none z-0 hidden lg:block" />
        )}
        {currentStep === 3 && (
          <div className="absolute bottom-4 left-4 right-4 h-[200px] border-2 border-red-500/40 rounded-xl animate-pulse pointer-events-none z-0 hidden lg:block" />
        )}
        {currentStep === 4 && (
          <div className="absolute top-2 left-4 right-4 h-12 border-2 border-emerald-500/40 rounded-lg animate-pulse pointer-events-none z-0 hidden lg:block" />
        )}

        <motion.div
          key={currentStep}
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -15 }}
          transition={{ type: "spring", damping: 24, stiffness: 220 }}
          className={`w-full max-w-md bg-[#090b11] border border-slate-800 rounded-2xl p-6 shadow-2xl relative z-50 flex flex-col ${
            step.position === "right" ? "lg:mr-[-18%] lg:mt-[-5%]" :
            step.position === "bottom" ? "lg:mt-[15%]" :
            step.position === "top" ? "lg:mt-[-20%]" : ""
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800/60 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-600/10 border border-blue-500/15">
                <Compass className="w-4 h-4 text-blue-400" />
              </span>
              <span className="text-[10px] uppercase font-mono tracking-wider font-extrabold text-blue-500">
                Workspace Tour {currentStep + 1} of {steps.length}
              </span>
            </div>
            <button 
              onClick={handleComplete}
              className="p-1 rounded-md hover:bg-slate-800 text-slate-500 hover:text-white transition-colors"
              title="Close Tour"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body Content */}
          <div className="flex items-start gap-4 py-2">
            <div className="bg-slate-900/60 p-3 rounded-2xl shrink-0 border border-slate-800/40">
              {step.icon}
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-slate-100">{step.title}</h3>
              <p className="text-xs text-slate-400 leading-relaxed font-sans select-text">{step.description}</p>
            </div>
          </div>

          {/* Footer Controls */}
          <div className="flex items-center justify-between border-t border-slate-800/60 mt-6 pt-4">
            <button
              onClick={handleComplete}
              className="text-[11px] font-mono text-slate-500 hover:text-slate-300 font-medium transition-colors"
            >
              Skip Onboarding Tour
            </button>

            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <button
                  onClick={handleBack}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-semibold text-slate-300 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Back
                </button>
              )}

              <button
                onClick={handleNext}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-semibold text-white shadow-md active:scale-95 transition-all cursor-pointerUnified"
              >
                {currentStep === steps.length - 1 ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Complete
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
