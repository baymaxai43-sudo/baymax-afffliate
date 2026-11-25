'use client';

import { useEffect, type ReactNode } from 'react';

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled,
  type = 'button',
  className = '',
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'outline' | 'danger' | 'sky';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  title?: string;
}) {
  const base =
    'inline-flex items-center justify-center gap-2 font-semibold rounded-full transition-all active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none';
  const sizes = {
    sm: 'text-xs px-3 py-1.5',
    md: 'text-sm px-4 py-2.5',
    lg: 'text-base px-6 py-3.5',
  }[size];
  const variants = {
    primary: 'bg-navy text-white hover:bg-navy-2 shadow-lg shadow-navy/20',
    sky: 'bg-sky-deep text-white hover:bg-sky shadow-lg shadow-sky-deep/30',
    ghost: 'bg-navy/5 text-navy hover:bg-navy/10',
    outline: 'border border-navy/15 bg-white text-navy hover:border-navy/30',
    danger: 'bg-danger/10 text-danger hover:bg-danger/20',
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} className={`${base} ${sizes} ${variants} ${className}`}>
      {children}
    </button>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white/65 backdrop-blur-xl rounded-3xl border border-white/80 shadow-[0_12px_36px_rgba(36,75,125,.08),inset_0_1px_0_rgba(255,255,255,.85)] ${className}`}>
      {children}
    </div>
  );
}

export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'blue' | 'green' | 'amber' | 'red' }) {
  const tones = {
    gray: 'bg-navy/5 text-navy/60',
    blue: 'bg-sky-deep/10 text-sky-deep',
    green: 'bg-success/10 text-success',
    amber: 'bg-warn/10 text-warn',
    red: 'bg-danger/10 text-danger',
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${tones}`}>
      {children}
    </span>
  );
}

export function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  autoFocus,
  className = '',
  onKeyDown,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}) {
  return (
    <input
      type={type}
      value={value}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      className={`w-full rounded-xl border border-navy/10 bg-white px-4 py-2.5 text-sm text-ink placeholder:text-navy/35 outline-none focus:border-sky-deep focus:ring-2 focus:ring-sky-deep/20 transition ${className}`}
    />
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${width} fade-up max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h3 className="font-bold text-lg text-navy">{title}</h3>
          <button onClick={onClose} className="text-navy/40 hover:text-navy p-1" aria-label="Close">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="px-6 pb-6">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, hint, action }: { icon: ReactNode; title: string; hint: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-sky-deep/10 text-sky-deep flex items-center justify-center mb-4">{icon}</div>
      <h3 className="font-bold text-navy text-lg">{title}</h3>
      <p className="text-sm text-navy/50 mt-1 max-w-sm">{hint}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
