import type { ReactNode } from 'react';

const DEM_ATTRIBUTION = 'Contains modified Copernicus DEM data';

interface MenuScreenProps {
  subtitle: string;
  back?: { label: string; onClick: () => void };
  children: ReactNode;
}

/** Shared frame for the menu screens: title, optional back button, card grid, attribution. */
export function MenuScreen({ subtitle, back, children }: MenuScreenProps) {
  return (
    <main className="menu">
      <header className="menu__header">
        {back && (
          <button type="button" className="menu__back" onClick={back.onClick}>
            <span aria-hidden="true">‹</span> {back.label}
          </button>
        )}
        <h1 className="menu__title">Mountain Odyssey</h1>
        <h2 className="menu__subtitle">{subtitle}</h2>
      </header>
      <div className="menu__grid">{children}</div>
      <footer className="menu__credit">{DEM_ATTRIBUTION}</footer>
    </main>
  );
}
