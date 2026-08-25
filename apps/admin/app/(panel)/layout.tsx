import { PanelShell } from '@/components/panel-shell';

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return <PanelShell>{children}</PanelShell>;
}
