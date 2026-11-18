import { type ComponentType, lazy, Suspense } from 'react';

/** A screen that is downloaded the first time it is opened, with a quiet placeholder meanwhile. */
export function lazyNamed<P extends object>(load: () => Promise<ComponentType<P>>) {
  const C = lazy(async () => ({ default: await load() }));
  return function Lazy(props: P) {
    return <Suspense fallback={<div className="lazy-wait" aria-busy="true"><i /></div>}><C {...(props as any)} /></Suspense>;
  };
}
