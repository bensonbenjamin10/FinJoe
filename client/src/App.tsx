import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Login from "@/pages/login";
import Setup from "@/pages/setup";
import AdminFinJoe from "@/pages/admin-finjoe";
import { ProtectedRoute } from "@/components/protected-route";

function Router() {
  return (
    <div className="flex flex-col min-h-screen">
      <Switch>
        <Route path="/setup" component={Setup} />
        <Route path="/login" component={Login} />
        <Route path="/admin/finjoe">
          <ProtectedRoute>
            <AdminFinJoe />
          </ProtectedRoute>
        </Route>
        <Route path="/">
          <Redirect to="/admin/finjoe" />
        </Route>
        <Route path="/admin">
          <Redirect to="/admin/finjoe" />
        </Route>
      </Switch>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
