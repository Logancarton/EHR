"use client";

import { useEffect, useRef, useState } from "react";
import { userInitials, userRoleLabel } from "../../lib/auth-client";
import { useAuthSession } from "./AuthSessionGate";

export default function CurrentUserMenu() {
  const { user, logout } = useAuthSession();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      setOpen(false);
      root.current?.querySelector<HTMLButtonElement>("button")?.focus();
    };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape, true);
    return () => { window.removeEventListener("pointerdown", outside); window.removeEventListener("keydown", escape, true); };
  }, [open]);
  const [signingOut, setSigningOut] = useState(false);
  const label = user.credentials
    ? `${user.displayName}, ${user.credentials}`
    : user.displayName;

  async function handleLogout() {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="current-user-menu" ref={root}>
      <button
        type="button"
        className="provider-avatar"
        aria-label={`Account menu for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${label} · ${userRoleLabel(user.role)}`}
        onClick={() => setOpen((value) => !value)}
      >
        {userInitials(user)}
      </button>

      {open && (
        <div className="current-user-popover" role="menu">
          <div className="current-user-identity">
            <div className="current-user-large-avatar">{userInitials(user)}</div>
            <div>
              <strong>{user.displayName}</strong>
              {user.credentials && <span>{user.credentials}</span>}
              <small>{userRoleLabel(user.role)}</small>
            </div>
          </div>
          <div className="current-user-boundary">
            Clinical actions use this server-verified identity and role.
          </div>
          <button type="button" role="menuitem" onClick={() => setHelp(true)}>Help</button>
          {help && <p role="status">Help documentation is not connected yet.</p>}
          <button type="button" role="menuitem" disabled={signingOut} onClick={handleLogout}>
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
