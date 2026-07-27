import React, { useEffect, useState } from "react";
import { AlertTriangle, KeyRound, LogOut, UserPlus, X } from "lucide-react";
import auth, { authMessage } from "./lib/auth";
import { COLOR } from "./theme";
import { ASSIGNABLE_ROLES, canManageStaff, roleLabel } from "./lib/roles";

function Field({ label, hint, ...props }) {
  return (
    <label className="block">
      <span className="text-sm font-medium" style={{ color: COLOR.inkSoft }}>
        {label}
      </span>
      <input
        {...props}
        className="mt-1 w-full rounded-xl border px-3 py-2.5 text-base outline-none"
        style={{ borderColor: COLOR.line, color: COLOR.ink, background: "#fff" }}
      />
      {hint && (
        <span className="mt-1 block text-xs" style={{ color: COLOR.inkSoft }}>
          {hint}
        </span>
      )}
    </label>
  );
}

function Notice({ children }) {
  if (!children) return null;
  return (
    <p
      className="flex items-start gap-2 rounded-xl p-3 text-sm"
      style={{ background: "#FBEAEC", color: COLOR.alert }}
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/**
 * The gate in front of the app. On a brand-new deployment there are no accounts
 * yet, so instead of an unanswerable login form it offers to create the owner's
 * account — otherwise the shop could never get in.
 */
export function SignInScreen({ onSignedIn }) {
  const [mode, setMode] = useState(null); // null while we ask the server
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    auth
      .state()
      .then((s) => alive && setMode(s.needsSetup ? "setup" : "login"))
      .catch(() => alive && setMode("login"));
    return () => {
      alive = false;
    };
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user =
        mode === "setup"
          ? await auth.setup({ username, name, password })
          : await auth.login({ username, password });
      onSignedIn(user);
    } catch (err) {
      setError(authMessage(err));
      setBusy(false);
    }
  }

  const setup = mode === "setup";

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-5"
      style={{ background: COLOR.bg, fontFamily: "'Space Grotesk', sans-serif" }}
    >
      <div className="w-full" style={{ maxWidth: 380 }}>
        <h1 className="font-display text-3xl" style={{ color: COLOR.acai }}>
          Quick Açaí
        </h1>
        <p className="mt-1 text-sm" style={{ color: COLOR.inkSoft }}>
          {mode === null
            ? "Cargando…"
            : setup
            ? "Crea la cuenta del dueño para empezar."
            : "Inicia sesión para abrir la caja."}
        </p>

        {mode !== null && (
          <form
            onSubmit={submit}
            className="mt-5 space-y-3 rounded-2xl p-5"
            style={{ background: COLOR.card, border: `1px solid ${COLOR.line}` }}
          >
            {setup && (
              <Field
                label="Nombre de la persona"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="Luis Rangel"
                required
              />
            )}
            <Field
              label="Usuario"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="luis"
              required
            />
            <Field
              label="Contraseña"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={setup ? "new-password" : "current-password"}
              hint={setup ? "Mínimo 6 caracteres." : undefined}
              required
            />

            <Notice>{error}</Notice>

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl py-3 text-base font-semibold"
              style={{ background: COLOR.acai, color: "#fff", opacity: busy ? 0.7 : 1 }}
            >
              {busy ? "Un momento…" : setup ? "Crear cuenta y entrar" : "Entrar"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/**
 * Staff list, owner only. Accounts are deactivated rather than deleted, so past
 * sales keep showing who rang them up.
 */
export function TeamPanel({ me, onSignOut }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", username: "", password: "", role: "employee" });
  const [resetFor, setResetFor] = useState(null);
  const [resetPassword, setResetPassword] = useState("");
  const [note, setNote] = useState(null);

  const isOwner = canManageStaff(me.role);

  async function refresh() {
    try {
      setUsers(await auth.listUsers());
    } catch (err) {
      setError(authMessage(err));
    }
  }

  useEffect(() => {
    if (isOwner) refresh();
  }, [isOwner]);

  async function addUser(e) {
    e.preventDefault();
    setError(null);
    try {
      await auth.createUser(draft);
      setNote(`${roleLabel(draft.role)} agregado.`);
      setDraft({ name: "", username: "", password: "", role: "employee" });
      setAdding(false);
      refresh();
    } catch (err) {
      setError(authMessage(err));
    }
  }

  async function deactivate(u) {
    setError(null);
    try {
      await auth.deactivateUser(u.id);
      setNote(`${u.name} ya no tiene acceso.`);
      refresh();
    } catch (err) {
      setError(authMessage(err));
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setError(null);
    try {
      await auth.setPassword(resetFor.id, resetPassword);
      setNote(`Contraseña de ${resetFor.name} actualizada.`);
      setResetFor(null);
      setResetPassword("");
    } catch (err) {
      setError(authMessage(err));
    }
  }

  return (
    <div className="space-y-3">
      <div
        className="rounded-2xl p-4"
        style={{ background: COLOR.card, border: `1px solid ${COLOR.line}` }}
      >
        <p className="text-sm" style={{ color: COLOR.inkSoft }}>
          Sesión de
        </p>
        <p className="text-lg font-semibold" style={{ color: COLOR.ink }}>
          {me.name}
        </p>
        <p className="text-sm" style={{ color: COLOR.inkSoft }}>
          {me.username} · {roleLabel(me.role)}
        </p>
        <button
          onClick={onSignOut}
          className="mt-3 flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold"
          style={{ background: COLOR.acaiPale, color: COLOR.acai }}
        >
          <LogOut size={15} /> Cerrar sesión
        </button>
      </div>

      {!isOwner && (
        <p className="px-1 text-sm" style={{ color: COLOR.inkSoft }}>
          Solo el dueño puede administrar las cuentas del personal.
        </p>
      )}

      {isOwner && (
        <>
          <Notice>{error}</Notice>
          {note && (
            <p
              className="rounded-xl p-3 text-sm"
              style={{ background: "#EFF6E4", color: COLOR.kiwi }}
            >
              {note}
            </p>
          )}

          {users === null ? (
            <p className="px-1 text-sm" style={{ color: COLOR.inkSoft }}>
              Cargando empleados…
            </p>
          ) : (
            users.map((u) => (
              <div
                key={u.id}
                className="rounded-2xl p-3.5"
                style={{
                  background: COLOR.card,
                  border: `1px solid ${COLOR.line}`,
                  opacity: u.active ? 1 : 0.55,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium" style={{ color: COLOR.ink }}>
                      {u.name}
                    </p>
                    <p className="text-sm" style={{ color: COLOR.inkSoft }}>
                      {u.username} · {roleLabel(u.role)}
                      {!u.active && " · sin acceso"}
                    </p>
                  </div>
                  {u.active && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => {
                          setResetFor(u);
                          setResetPassword("");
                        }}
                        aria-label={`Cambiar contraseña de ${u.name}`}
                        className="rounded-lg p-2"
                        style={{ background: COLOR.acaiPale, color: COLOR.acai }}
                      >
                        <KeyRound size={15} />
                      </button>
                      {u.id !== me.id && (
                        <button
                          onClick={() => deactivate(u)}
                          aria-label={`Quitar acceso a ${u.name}`}
                          className="rounded-lg p-2"
                          style={{ background: "#FBEAEC", color: COLOR.alert }}
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {resetFor && resetFor.id === u.id && (
                  <form onSubmit={changePassword} className="mt-3 space-y-2">
                    <Field
                      label="Contraseña nueva"
                      type="password"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      autoComplete="new-password"
                      hint="Mínimo 6 caracteres. Cierra las sesiones abiertas de esta persona."
                      required
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setResetFor(null)}
                        className="px-2 text-sm font-medium"
                        style={{ color: COLOR.inkSoft }}
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
                        style={{ background: COLOR.kiwi, color: "#fff" }}
                      >
                        Guardar
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ))
          )}

          {adding ? (
            <form
              onSubmit={addUser}
              className="space-y-3 rounded-2xl p-4"
              style={{ background: COLOR.card, border: `1px solid ${COLOR.line}` }}
            >
              <p className="text-base font-semibold" style={{ color: COLOR.ink }}>
                Nueva persona
              </p>

              <fieldset>
                <legend className="text-sm font-medium" style={{ color: COLOR.inkSoft }}>
                  Qué puede hacer
                </legend>
                <div className="mt-1.5 flex gap-2">
                  {ASSIGNABLE_ROLES.map((r) => {
                    const on = draft.role === r.value;
                    return (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setDraft({ ...draft, role: r.value })}
                        aria-pressed={on}
                        className="flex-1 rounded-xl border-2 px-3 py-2.5 text-left"
                        style={{
                          borderColor: on ? COLOR.acai : COLOR.line,
                          background: on ? COLOR.acaiPale : "transparent",
                        }}
                      >
                        <span className="block text-sm font-semibold" style={{ color: COLOR.ink }}>
                          {r.label}
                        </span>
                        <span className="block text-xs" style={{ color: COLOR.inkSoft }}>
                          {r.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <Field
                label="Nombre"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="María López"
                required
              />
              <Field
                label="Usuario"
                value={draft.username}
                onChange={(e) => setDraft({ ...draft, username: e.target.value })}
                autoCapitalize="none"
                spellCheck={false}
                placeholder="maria"
                required
              />
              <Field
                label="Contraseña"
                type="password"
                value={draft.password}
                onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                autoComplete="new-password"
                hint="Mínimo 6 caracteres. Dísela a la persona para que entre."
                required
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="px-2 text-sm font-medium"
                  style={{ color: COLOR.inkSoft }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl py-3 text-base font-semibold"
                  style={{ background: COLOR.acai, color: "#fff" }}
                >
                  Agregar
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => {
                setAdding(true);
                setNote(null);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-base font-semibold"
              style={{ background: COLOR.card, border: `1px dashed ${COLOR.line}`, color: COLOR.acai }}
            >
              <UserPlus size={17} /> Agregar persona
            </button>
          )}
        </>
      )}
    </div>
  );
}
