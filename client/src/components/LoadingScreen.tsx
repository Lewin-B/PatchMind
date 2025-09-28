"use client";

import { Card, CardContent } from "@/components/ui/card";
import { RefreshCw, Package, FileText, Code } from "lucide-react";

interface LoadingScreenProps {
  isVisible: boolean;
}

export function LoadingScreen({ isVisible }: LoadingScreenProps) {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md bg-slate-800/95 border-slate-700 backdrop-blur-sm">
        <CardContent className="text-center py-8">
          <div className="space-y-6">
            {/* Main Loading Spinner */}
            <div className="flex justify-center">
              <div className="relative">
                <RefreshCw className="h-12 w-12 animate-spin text-blue-400" />
                <div className="absolute inset-0 rounded-full border-2 border-blue-400/20"></div>
              </div>
            </div>

            {/* Title */}
            <div>
              <h3 className="text-xl font-semibold text-slate-200 mb-2">
                Analyzing Repository
              </h3>
              <p className="text-slate-400">
                Our AI agents are working to upgrade your dependencies...
              </p>
            </div>

            {/* Progress Steps */}
            <div className="space-y-4">
              {/* Step 1: Planner */}
              <div className="flex items-center space-x-3 p-3 rounded-lg bg-slate-700/50 border border-slate-600">
                <div className="flex-shrink-0">
                  <div className="p-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500">
                    <Package className="h-4 w-4 text-white" />
                  </div>
                </div>
                <div className="flex-1 text-left">
                  <div className="flex items-center space-x-2">
                    <RefreshCw className="h-3 w-3 animate-spin text-blue-400" />
                    <span className="text-sm font-medium text-slate-200">
                      Planning Upgrade Strategy
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Analyzing dependencies and creating upgrade plan
                  </p>
                </div>
              </div>

              {/* Step 2: Parser */}
              <div className="flex items-center space-x-3 p-3 rounded-lg bg-slate-700/30 border border-slate-600/50">
                <div className="flex-shrink-0">
                  <div className="p-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500">
                    <FileText className="h-4 w-4 text-white" />
                  </div>
                </div>
                <div className="flex-1 text-left">
                  <div className="flex items-center space-x-2">
                    <div className="h-3 w-3 rounded-full bg-slate-500"></div>
                    <span className="text-sm font-medium text-slate-300">
                      Parsing Repository Structure
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Examining codebase for compatibility issues
                  </p>
                </div>
              </div>

              {/* Step 3: Codemod */}
              <div className="flex items-center space-x-3 p-3 rounded-lg bg-slate-700/30 border border-slate-600/50">
                <div className="flex-shrink-0">
                  <div className="p-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500">
                    <Code className="h-4 w-4 text-white" />
                  </div>
                </div>
                <div className="flex-1 text-left">
                  <div className="flex items-center space-x-2">
                    <div className="h-3 w-3 rounded-full bg-slate-500"></div>
                    <span className="text-sm font-medium text-slate-300">
                      Generating Code Modifications
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Creating safe upgrade modifications
                  </p>
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Progress</span>
                <span>Step 1 of 3</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full w-1/3 animate-pulse"></div>
              </div>
            </div>

            {/* Additional Info */}
            <div className="text-xs text-slate-500">
              <p>This may take a few moments depending on repository size...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
