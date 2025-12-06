import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { SessionTimeoutWarning } from "@/components/auth/SessionTimeoutWarning";
import { MainLayout } from "@/components/layout/MainLayout";

// Pages
import Index from "./pages/Index";
import LoginPage from "./pages/LoginPage";
import OnboardingPage from "./pages/OnboardingPage";
import UnauthorizedPage from "./pages/UnauthorizedPage";
import PatientsPage from "./pages/PatientsPage";
import SessionsPage from "./pages/SessionsPage";
import ClinicPage from "./pages/ClinicPage";
import AdministrationPage from "./pages/AdministrationPage";
import ProfilePage from "./pages/ProfilePage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          {/* SessionTimeoutWarning is rendered globally but only activates when authenticated */}
          <SessionTimeoutWarning />
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />

            {/* Onboarding route - for users without clinic */}
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute skipOnboardingCheck>
                  <OnboardingPage />
                </ProtectedRoute>
              }
            />

            {/* Protected routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <Index />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/patients"
              element={
                <ProtectedRoute requiredRole={['doctor', 'admin']}>
                  <MainLayout>
                    <PatientsPage />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sessions"
              element={
                <ProtectedRoute requiredRole={['doctor', 'admin']}>
                  <MainLayout>
                    <SessionsPage />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/clinic"
              element={
                <ProtectedRoute requiredRole="admin">
                  <MainLayout>
                    <ClinicPage />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/administration"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <AdministrationPage />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <ProfilePage />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
