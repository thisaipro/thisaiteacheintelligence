/* MVP only: data lives on this device, so offer a way to start again. */
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { isMvp } from '../../model/config';
import { BASE_PATH } from './ModuleHeader';

export function MvpResetButton({ label = 'Reset demo data', className = 'btn ghost sm' }: { label?: string; className?: string }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  if (!isMvp()) return null;
  async function reset() {
    if (!window.confirm('This clears every ranking and profile saved on this device and restores the demo teachers. Continue?')) return;
    const { resetMvpData } = await import('../../api/localBackend');
    resetMvpData();
    qc.clear();
    nav(BASE_PATH);
  }
  return <button className={className} onClick={reset}>{label}</button>;
}
