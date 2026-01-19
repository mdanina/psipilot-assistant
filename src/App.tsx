import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { SidebarProvider } from "@/contexts/SidebarContext";
import { BackgroundUploadProvider } from "@/contexts/BackgroundUploadContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { SessionTimeoutWarning } from "@/components/auth/SessionTimeoutWarning";
import { MainLayout } from "@/components/layout/MainLayout";
import { ThemeProvider } from "@/components/ThemeProvider";
import { queryClient } from "@/lib/query-client";
import { LazyRoute } from "@/components/LazyRoute";

// Критические страницы - без lazy loading (быстрый первый рендер)
import Index from "./pages/Index";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import OnboardingPage from "./pages/OnboardingPage";
import UnauthorizedPage from "./pages/UnauthorizedPage";
import NotFound from "./pages/NotFound";

// Остальные страницы загружаются лениво через LazyRoute
// Это уменьшает initial bundle и ускоряет первую загрузку

const App = () => (
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <BackgroundUploadProvider>
            <SidebarProvider>
            {/* SessionTimeoutWarning is rendered globally but only activates when authenticated */}
            <SessionTimeoutWarning />
            <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
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
            {/* Пациенты - lazy loading */}
            <Route
              path="/patients"
              element={
                <ProtectedRoute requiredRole={['specialist', 'admin']}>
                  <MainLayout>
                    <LazyRoute
                      component={() => import("./pages/PatientsPage")}
                      loadingMessage="Загрузка списка пациентов..."
                    />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/patients/new"
              element={
                <ProtectedRoute requiredRole={['specialist', 'admin']}>
                  <MainLayout>
                    <LazyRoute
                      component={() => import("./pages/PatientCreatePage")}
                      loadingMessage="Загрузка формы..."
                    />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/patients/:id"
              element={
                <ProtectedRoute requiredRole={['specialist', 'admin']}>
                  <MainLayout>
                    <LazyRoute
                      component={() => import("./pages/PatientDetailPage")}
                      loadingMessage="Загрузка данных пациента..."
                    />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            {/* Сессии - lazy loading */}
            <Route
              path="/sessions"
              element={
                <ProtectedRoute requiredRole={['specialist', 'admin']}>
                  <MainLayout>
                    <LazyRoute
                      component={() => import("./pages/SessionsPage")}
                      loadingMessage="Загрузка сессий..."
                    />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sessions/:sessionId/analysis"
              element={
                <ProtectedRoute requiredRole={['specialist', 'admin']}>
                  <MainLayout>
                    <LazyRoute
                      component={() => import("./pages/SessionAnalysisPage")}
                      loadingMessage="Загрузка анализа сессии..."
                    />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            {/* Календарь - lazy loading */}
            <Route
              path="/calendar"
              element={
                <ProtectedRoute requiredRole={['specialist', 'admin']}>
                  <MainLayout>
                    <LazyRoute
                      component={() => import("./pages/CalendarPage")}
                      loadingMessage="Загрузка календаря..."
                    />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            {/* Администрирование - lazy loading */}
            <Route
              path="/administration"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <LazyRoute
                      component={() => import("./pages/AdministrationPage")}
                      loadingMessage="Загрузка администрирования..."
                    />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            {/* Профиль - lazy loading */}
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <LazyRoute
                      component={() => import("./pages/ProfilePage")}
                      loadingMessage="Загрузка профиля..."
                    />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
            </SidebarProvider>
            </BackgroundUploadProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;
