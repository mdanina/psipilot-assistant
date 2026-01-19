import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center px-4">
        <h1 className="mb-4 text-3xl sm:text-4xl font-bold">404</h1>
        <p className="mb-4 text-base sm:text-xl text-muted-foreground">Упс! Страница не найдена</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          Вернуться на главную
        </a>
      </div>
    </div>
  );
};

export default NotFound;
