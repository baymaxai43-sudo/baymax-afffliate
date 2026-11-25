'use client';

import { AppShell } from '@/components/AppShell';
import { Icon } from '@/components/icons';

export default function SystemPreferencesPage() {
  return (
    <AppShell title="System Preferences" back="/profile">
      <div className="baymax-profile-page bx-sub-page">
        <section className="baymax-profile-group" aria-label="System preferences">
          <div className="baymax-profile-row bx-static-row">
            <Icon name="palette" className="baymax-profile-row-icon" />
            <span>Theme</span>
            <span className="bx-row-value">Energy</span>
          </div>
          <div className="baymax-profile-row bx-static-row">
            <Icon name="globe" className="baymax-profile-row-icon" />
            <span>App Language</span>
            <span className="bx-row-value">English</span>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
