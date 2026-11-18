import { _t } from '../i18n';
/** Living Muslim mark: a heartbeat line with a mosque dome, a crescent and a minaret; the gold dot is "now". */
export function LogoMark({ size = 28, crescent = true }: { size?: number; crescent?: boolean }) {
  return (
    <svg className="logo-mark" viewBox="0 0 160 100" width={size * 1.6} height={size} aria-hidden="true">
      <path d="M6 72 H44 A18 18 0 0 1 80 72 H90 L97 16 L104 72 H120 L126 62 L132 72 H144" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      {crescent && (
        <>
          <path d="M62 54 V48" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <defs><mask id="lm-c"><rect width="160" height="100" fill="#fff" /><circle cx="62" cy="37.6" r="4.6" fill="#000" /></mask></defs>
          <circle cx="62" cy="40.5" r="6.4" fill="var(--gold)" mask="url(#lm-c)" />
        </>
      )}
      <circle cx="152" cy="72" r="7" fill="var(--gold)" />
    </svg>
  );
}

export function LogoLockup() {
  return (
    <div className="logo-lockup">
      <LogoMark size={64} />
      <b>Living Muslim</b>
      <small>{_t("вера, которая живёт каждый день")}</small>
    </div>
  );
}
