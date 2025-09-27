import { auth, signIn, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Github } from "lucide-react";

export default async function Home() {
  const session = await auth();

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-primary">PatchMind</h1>
            </div>
            <div className="flex items-center space-x-4">
              <form
                action={async () => {
                  "use server";
                  await signIn("github");
                }}
              >
                <Button type="submit" className="flex items-center space-x-2">
                  <Github className="h-4 w-4" />
                  <span>Sign in with GitHub</span>
                </Button>
              </form>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center">
          <h1 className="text-4xl sm:text-6xl font-bold text-foreground mb-6">
            Welcome to <span className="text-primary">PatchMind</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            Keep your codebase modern and secure with intelligent dependency
            management and automated updates that work seamlessly in the
            background.
          </p>

          {!session && (
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <form
                action={async () => {
                  "use server";
                  await signIn("github");
                }}
              >
                <Button size="lg" className="flex items-center space-x-2">
                  <Github className="h-5 w-5" />
                  <span>Get Started with GitHub</span>
                </Button>
              </form>
              <Button variant="outline" size="lg">
                Learn More
              </Button>
            </div>
          )}

          {session && (
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <a href="/dashboard">
                <Button size="lg" className="flex items-center space-x-2">
                  <Github className="h-5 w-5" />
                  <span>Go to Dashboard</span>
                </Button>
              </a>
              <form
                action={async () => {
                  "use server";
                  await signOut();
                }}
              >
                <Button variant="outline" size="lg" type="submit">
                  Sign Out
                </Button>
              </form>
            </div>
          )}
        </div>

        {/* Features Section */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-primary">Stay Updated</CardTitle>
              <CardDescription>
                Automatically track and apply dependency updates across your
                projects
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Never miss critical security patches or performance
                improvements. Keep your dependencies current without manual
                effort.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-primary">Smart Monitoring</CardTitle>
              <CardDescription>
                Intelligent analysis of your codebase health and update
                opportunities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Get insights into outdated packages, security vulnerabilities,
                and compatibility issues before they become problems.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-primary">
                Seamless Integration
              </CardTitle>
              <CardDescription>
                Works with your existing workflow and development tools
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Integrates with GitHub, supports all major package managers, and
                fits naturally into your development process.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-sm text-muted-foreground">
            <p>&copy; 2024 PatchMind. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
