import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, createHashRouter, RouterProvider } from 'react-router';
import { queryClient } from '@/lib/queryClient';
import { routes } from '@/routes';
import '@/styles/global.css';

// In Electron or local file environments, use createHashRouter so file:///.../index.html
// resolves to #/home instead of throwing "Page not found".
const isDesktopOrFile =
  typeof window !== 'undefined' &&
  (window.location.protocol === 'file:' || !!window.electronAPI?.isDesktop || window.location.origin === 'null');

const router = isDesktopOrFile ? createHashRouter(routes) : createBrowserRouter(routes);

const app = (
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>
);

// StrictMode deliberately remounts effects in development. That is useful in
// browsers, but it starts and tears down Electron's persistent bridges twice.
createRoot(document.getElementById('root')!).render(isDesktopOrFile ? app : <StrictMode>{app}</StrictMode>);
