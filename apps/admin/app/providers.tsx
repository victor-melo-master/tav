'use client';

import { AuthProvider } from '@/lib/auth';
import { Toaster } from 'sonner';

/**
 * Proveedores del cliente. Se monta en el layout raíz para que tanto el
 * login como el panel compartan el contexto de autenticación y las toasts.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      {children}
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            borderRadius: '12px',
            border: '1px solid #E5E8EC',
            background: '#FFFFFF',
            color: '#101828',
            fontSize: '13.5px',
          },
        }}
      />
    </AuthProvider>
  );
}
