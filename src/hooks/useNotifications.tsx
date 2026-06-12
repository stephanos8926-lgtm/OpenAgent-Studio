// File: src/hooks/useNotifications.ts
import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { NotificationItem, NotificationChannel, getPlatformConfig, NotificationSchema } from '../notifications/types';

interface NotificationContextValue {
  stack: NotificationItem[];
  push: (notif: Partial<NotificationItem>) => void;
  dismiss: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<NotificationItem[]>([]);
  const config = getPlatformConfig();

  const deliverWebNotification = useCallback((notif: NotificationItem) => {
    if (!("Notification" in window)) return;
    
    Notification.requestPermission().then(permission => {
      if (permission === "granted") {
        new window.Notification(notif.name, {
          body: notif.message,
          icon: '/favicon.ico'
        });
      }
    });
  }, []);

  const push = useCallback((raw: any) => {
    try {
      const validated = NotificationSchema.parse({
        id: crypto.randomUUID(),
        ...raw
      });

      if (validated.channel === NotificationChannel.WEB) {
        deliverWebNotification(validated);
        return;
      }

      setStack(prev => {
        if (prev.length >= config.maxCapacity) {
          console.warn('[Notification Stack] MAX CAPACITY REACHED');
          return prev;
        }
        return [...prev, validated];
      });

      if (validated.channel === NotificationChannel.TOAST) {
        setTimeout(() => {
          setStack(prev => prev.filter(n => n.id !== validated.id));
        }, 5000);
      }
    } catch (err: any) {
      console.error('[Notification Schema Error]', err.errors);
    }
  }, [config.maxCapacity, deliverWebNotification]);

  const dismiss = useCallback((id: string) => {
    setStack(prev => prev.filter(n => n.id !== id));
  }, []);

  return (
    <NotificationContext.Provider value={{ stack, push, dismiss }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within NotificationProvider');
  return context;
}
