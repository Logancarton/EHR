"use client";

import { useState } from "react";
import { userInitials, userRoleLabel } from "../../lib/auth-client";
import { useAuthSession } from "./AuthSessionGate";

export default function CurrentUserMenu() {
  const { user, logout } = useAuthSession();
  const [open, setOpen] = useState(false);
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
    <div className="current-user-menu">
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
          <button type="button" role="menuitem" disabled={signingOut} onClick={handleLogout}>
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
