"use client";

import { useEffect, useRef, useState } from "react";
import { userInitials, userRoleLabel } from "../../lib/auth-client";
import { useWorkspaceNavigation } from "../../lib/workspace-navigation-context";
import Icon from "../ui/Icon";
import { useAuthSession } from "./AuthSessionGate";

/**
 * Who is signed in, and — for whoever administers the practice — the way into
 * administering it.
 *
 * Organization administration has been reached through `Practice -> Practice
 * settings`. It was never a preferences screen: it provisions people, sets clinical
 * and practice roles, moves membership status and patient-access scope, issues
 * activation links and clears lockouts. That belongs beside the identity it acts on
 * rather than beside the layout controls, which are what the neighbouring
 * Preferences menu owns.
 *
 * This is the replacement path (UI-6f). The Practice entry stays until this one is
 * proven, which is the migration rule: add, verify, then remove exactly one entry.
 *
 * The entry is offered only to an actor the server already told us holds
 * `manage_organization`, so a control is never shown for an act the next request
 * would refuse. Hiding it is not the boundary — `/api/organization/members`
 * refuses with a 403 either way — it is the product declining to advertise a door
 * that will not open.
 */
export default function CurrentUserMenu() {
  const { user, logout, hasPermission } = useAuthSession();
  const nav = useWorkspaceNavigation();
  const canAdministerOrganization = hasPermission("manage_organization");
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
          {canAdministerOrganization && (
            <button
              type="button"
              role="menuitem"
              className="current-user-admin"
              data-account-action="organization-administration"
              onClick={() => {
                setOpen(false);
                // The same controller command the retired menu entry issued, so this is
                // the identical navigation path rather than a lookalike of it.
                nav.openGlobalModule("settings");
              }}
            >
              <Icon name="manage_accounts" size="sm" />
              <span>
                <strong>Organization administration</strong>
                <small>People, roles, sign-in access and activation links</small>
              </span>
            </button>
          )}
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
