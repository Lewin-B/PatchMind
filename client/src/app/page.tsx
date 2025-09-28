import { auth, signIn, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Github,
  GitPullRequest,
  Package,
  RefreshCw,
  Clock,
  CheckCircle,
} from "lucide-react";

export default async function Home() {
  const session = await auth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white">
      {/* Animated background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20"></div>
      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/5 to-emerald-500/10"></div>

      <nav className="relative border-b border-slate-700/50 backdrop-blur-sm bg-slate-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600">
                <Package className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                PatchMind
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              {!session && (
                <form
                  action={async () => {
                    "use server";
                    await signIn("github");
                  }}
                >
                  <Button
                    type="submit"
                    className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 border border-slate-600"
                  >
                    <Github className="h-4 w-4" />
                    <span>Sign in with GitHub</span>
                  </Button>
                </form>
              )}
              {session && (
                <form
                  action={async () => {
                    "use server";
                    await signOut();
                  }}
                >
                  <Button
                    variant="outline"
                    type="submit"
                    className="border-slate-600 text-slate-300 hover:bg-slate-800"
                  >
                    Sign Out
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center">
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-slate-800/50 border border-slate-700 mb-8">
            <GitPullRequest className="h-4 w-4 mr-2 text-blue-400" />
            <span className="text-sm text-slate-300">
              On-Demand Dependency Updates
            </span>
          </div>

          <h1 className="text-5xl sm:text-7xl font-bold mb-6">
            Update Dependencies{" "}
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent">
              When You Want
            </span>
          </h1>

          <p className="text-xl text-slate-400 mb-12 max-w-4xl mx-auto leading-relaxed">
            PatchMind creates pull requests to update your outdated
            dependencies. Simple, straightforward, and only when you ask for it.
            No automation, no surprises—just clean PRs when you need them.
          </p>

          {!session && (
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
              <form
                action={async () => {
                  "use server";
                  await signIn("github");
                }}
              >
                <Button
                  size="lg"
                  className="flex items-center space-x-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-3 text-lg"
                >
                  <Github className="h-5 w-5" />
                  <span>Connect GitHub</span>
                </Button>
              </form>
              <Button
                variant="outline"
                size="lg"
                className="border-slate-600 text-slate-300 hover:bg-slate-800 px-8 py-3 text-lg"
              >
                Learn More
              </Button>
            </div>
          )}

          {session && (
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
              <a href="/dashboard">
                <Button
                  size="lg"
                  className="flex items-center space-x-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-3 text-lg"
                >
                  <GitPullRequest className="h-5 w-5" />
                  <span>View Repositories</span>
                </Button>
              </a>
            </div>
          )}
        </div>

        {/* How it works */}
        <div className="mt-32">
          <h2 className="text-3xl font-bold text-center text-slate-200 mb-16">
            How PatchMind Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm hover:bg-slate-800/70 transition-all duration-300 group">
              <CardHeader className="text-center pb-4">
                <div className="flex justify-center mb-4">
                  <div className="p-3 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 group-hover:scale-110 transition-transform">
                    <RefreshCw className="h-6 w-6 text-white" />
                  </div>
                </div>
                <CardTitle className="text-blue-400 text-xl">
                  1. Check Dependencies
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <p className="text-slate-300 leading-relaxed">
                  We scan your repository to find outdated packages in your
                  package.json, requirements.txt, or other dependency files.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm hover:bg-slate-800/70 transition-all duration-300 group">
              <CardHeader className="text-center pb-4">
                <div className="flex justify-center mb-4">
                  <div className="p-3 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 group-hover:scale-110 transition-transform">
                    <Clock className="h-6 w-6 text-white" />
                  </div>
                </div>
                <CardTitle className="text-purple-400 text-xl">
                  2. You Request Updates
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <p className="text-slate-300 leading-relaxed">
                  When you are ready to update, click the button. No automatic
                  updates, no scheduled runs—only when you decide it is time.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm hover:bg-slate-800/70 transition-all duration-300 group">
              <CardHeader className="text-center pb-4">
                <div className="flex justify-center mb-4">
                  <div className="p-3 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 group-hover:scale-110 transition-transform">
                    <GitPullRequest className="h-6 w-6 text-white" />
                  </div>
                </div>
                <CardTitle className="text-emerald-400 text-xl">
                  3. Get Clean PRs
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <p className="text-slate-300 leading-relaxed">
                  We create organized pull requests with updated dependencies,
                  ready for your review and testing process.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Simple feature list */}
        <div className="mt-24 max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-slate-200 mb-12">
            What You Get
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-start space-x-3 p-4 rounded-lg bg-slate-800/30 border border-slate-700/50">
              <CheckCircle className="h-5 w-5 text-emerald-400 mt-1 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-slate-200 mb-1">
                  Manual Control
                </h3>
                <p className="text-sm text-slate-400">
                  Updates only happen when you request them
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3 p-4 rounded-lg bg-slate-800/30 border border-slate-700/50">
              <CheckCircle className="h-5 w-5 text-emerald-400 mt-1 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-slate-200 mb-1">
                  Clean Pull Requests
                </h3>
                <p className="text-sm text-slate-400">
                  Well-formatted PRs ready for review
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3 p-4 rounded-lg bg-slate-800/30 border border-slate-700/50">
              <CheckCircle className="h-5 w-5 text-emerald-400 mt-1 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-slate-200 mb-1">
                  Multiple Package Managers
                </h3>
                <p className="text-sm text-slate-400">
                  Works with npm, pip, and other common tools
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3 p-4 rounded-lg bg-slate-800/30 border border-slate-700/50">
              <CheckCircle className="h-5 w-5 text-emerald-400 mt-1 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-slate-200 mb-1">
                  GitHub Integration
                </h3>
                <p className="text-sm text-slate-400">
                  Direct integration with your GitHub repositories
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative border-t border-slate-700/50 mt-32 bg-slate-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-3 mb-4 md:mb-0">
              <div className="p-2 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600">
                <Package className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-semibold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                PatchMind
              </span>
            </div>
            <div className="text-sm text-slate-400">
              <p>
                &copy; 2024 PatchMind. Simple dependency updates when you need
                them.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
