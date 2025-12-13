import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { SidebarProvider } from "@/contexts/SidebarContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { SessionTimeoutWarning } from "@/components/auth/SessionTimeoutWarning";
import { MainLayout } from "@/components/layout/MainLayout";
import { ThemeProvider } from "@/components/ThemeProvider";
import { queryClient } from "@/lib/query-client";

// Pages
import Index from "./pages/Index";
import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import OnboardingPage from "./pages/OnboardingPage";
import UnauthorizedPage from "./pages/UnauthorizedPage";
import PatientsPage from "./pages/PatientsPage";
import PatientDetailPage from "./pages/PatientDetailPage";
import PatientCreatePage from "./pages/PatientCreatePage";
import SessionsPage from "./pages/SessionsPage";
import SessionAnalysisPage from "./pages/SessionAnalysisPage";
import CalendarPage from "./pages/CalendarPage";
import AdministrationPage from "./pages/AdministrationPage";
import ProfilePage from "./pages/ProfilePage";
import NotFound from "./pages/NotFound";

const App = () => (
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <SidebarProvider>
            {/* SessionTimeoutWarning is rendered globally but only activates when authenticated */}
            <SessionTimeoutWarning />
            <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
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
                <ProtectedRoute requiredRole={['specialist', 'admin']}>
                  <MainLayout>
                    <PatientsPage />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/patients/new"
              element={
                <ProtectedRoute requiredRole={['specialist', 'admin']}>
                  <MainLayout>
                    <PatientCreatePage />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/patients/:id"
              element={
                <ProtectedRoute requiredRole={['specialist', 'admin']}>
                  <MainLayout>
                    <PatientDetailPage />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sessions"
              element={
                <ProtectedRoute requiredRole={['specialist', 'admin']}>
                  <MainLayout>
                    <SessionsPage />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sessions/:sessionId/analysis"
              element={
                <ProtectedRoute requiredRole={['specialist', 'admin']}>
                  <MainLayout>
                    <SessionAnalysisPage />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/calendar"
              element={
                <ProtectedRoute requiredRole={['specialist', 'admin']}>
                  <MainLayout>
                    <CalendarPage />
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
            </SidebarProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;
