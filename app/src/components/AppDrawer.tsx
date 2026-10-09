import { ReactNode, useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { Drawer } from 'react-native-drawer-layout';
import AppSidebar from './AppSidebar';

let openSink: (() => void) | null = null;

// Any screen can call this to slide the global drawer out.
export function openAppDrawer() {
  openSink?.();
}

export default function AppDrawerHost({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { width } = useWindowDimensions();

  useEffect(() => {
    openSink = () => setOpen(true);
    return () => {
      openSink = null;
    };
  }, []);

  return (
    <Drawer
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      drawerPosition="left"
      drawerType="front"
      swipeEdgeWidth={40}
      configureGestureHandler={(gesture) =>
        // Fail fast on taps and vertical scrolls so buttons respond instantly;
        // only deliberate horizontal drags near the edge open the drawer.
        gesture.activeOffsetX([-28, 28]).failOffsetY([-14, 14])
      }
      drawerStyle={{ width: Math.min(320, width * 0.84) }}
      overlayStyle={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      renderDrawerContent={() => <AppSidebar onClose={() => setOpen(false)} />}
      style={{ flex: 1 }}
    >
      {children}
    </Drawer>
  );
}
