import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { IconChevronLeft, IconTrendDown, IconTrendFlat, IconTrendUp, IconX } from '../icons';
import { TREND_LABEL, type TrendResult } from '../../domain/trend';
import { formatPct } from '../../domain/format';

export function PageHeader({ title, back, actions }: { title: ReactNode; back?: boolean | string; actions?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <header className="page-header">
      {back && (
        <button
          type="button"
          className="icon-btn"
          aria-label="Indietro"
          onClick={() => (typeof back === 'string' ? navigate(back) : window.history.length > 1 ? navigate(-1) : navigate('/'))}
        >
          <IconChevronLeft />
        </button>
      )}
      <h1>{title}</h1>
      {actions}
    </header>
  );
}

export function Modal({
  open, title, onClose, children, footer, labelledBy,
}: { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; labelledBy?: string }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy ?? id} ref={ref} tabIndex={-1}>
        <div className="modal-header">
          <h2 id={id}>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Chiudi" onClick={onClose}>
            <IconX />
          </button>
        </div>
        {children}
        {footer && <div className="modal-actions">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open, title, message, confirmLabel = 'Conferma', cancelLabel = 'Annulla', danger, onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>{confirmLabel}</button>
        </>
      }
    >
      <div className="stack muted">{message}</div>
    </Modal>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty-state" role="status">
      {icon}
      <p className="strong">{title}</p>
      {children}
    </div>
  );
}

/** Trend: colore + icona + testo + percentuale (mai solo il colore). */
export function TrendBadge({ trend, compact }: { trend: TrendResult; compact?: boolean }) {
  const Icon = trend.direction === 'up' ? IconTrendUp : trend.direction === 'down' ? IconTrendDown : IconTrendFlat;
  let label: string = TREND_LABEL[trend.status];
  if (trend.status === 'stable' && trend.direction && trend.direction !== 'flat') {
    label = trend.direction === 'up' ? 'In aumento' : 'In diminuzione';
  }
  return (
    <span className={`trend ${trend.status}`}>
      {trend.status !== 'insufficient' && <Icon size={compact ? 18 : 22} />}
      <span>{compact && trend.status !== 'insufficient' ? '' : label}</span>
      {trend.changePct !== null && <span className="num">{formatPct(trend.changePct)}</span>}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {hint && <span className="tiny muted">{hint}</span>}
    </div>
  );
}

export function Switch({
  label, checked, onChange, hint, disabled,
}: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode; disabled?: boolean }) {
  return (
    <label className="switch">
      <span className="grow">
        <span className="strong">{label}</span>
        {hint && <span className="hint" style={{ display: 'block' }}>{hint}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Segmented<T extends string>({
  options, value, onChange, label,
}: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="hint">{hint}</small>}
    </label>
  );
}
