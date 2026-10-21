/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, useState, type ReactElement } from "react";
import AdminConfirm from "@/components/admin/AdminConfirm";

// Reproduz o bug reportado pelo dono: o input "Motivo" do AdminConfirm perdia
// o foco a cada tecla ("não dá para digitar direito"). Causa: o efeito de foco
// dependia da identidade de `onClose`, e todos os chamadores passam arrow
// inline - cada setReason re-renderizava o pai, o efeito re-rodava e
// dialogRef.focus() roubava o foco do input de volta para o diálogo.
// O harness abaixo replica o chamador real (arrow inline no JSX).

// Ambiente act do React: sem a flag, act() não flusha efeitos no happy-dom.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

async function mount(node: ReactElement) {
  const container = document.body.appendChild(document.createElement("div"));
  root = createRoot(container);
  await act(async () => {
    root?.render(node);
  });
}

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
    root = null;
  }
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function Harness({ onClose }: { onClose?: () => void }) {
  const [reason, setReason] = useState("");
  return (
    <AdminConfirm
      open
      title="Suspender conta"
      lines={[{ label: "Conta", value: "cliente@teste.dev" }]}
      consequence="Bloqueia o acesso."
      confirmLabel="Suspender"
      danger
      reasonRequired
      reason={reason}
      onReason={setReason}
      onConfirm={() => undefined}
      onClose={() => onClose?.()}
    />
  );
}

function reasonInput(): HTMLInputElement {
  const input = document.getElementById("admin-confirm-reason");
  if (!(input instanceof HTMLInputElement)) throw new Error("input do motivo ausente");
  return input;
}

function typeInto(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setValue?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("AdminConfirm - foco e digitação", () => {
  it("ao abrir, foca o diálogo (não o body)", async () => {
    await mount(<Harness />);
    const dialog = document.querySelector('[role="alertdialog"]');
    expect(dialog).toBeTruthy();
    expect(document.activeElement).toBe(dialog);
  });

  it("cada tecla no motivo mantém o foco no input - diálogo não rouba o foco", async () => {
    await mount(<Harness />);
    const input = reasonInput();
    act(() => { input.focus(); });
    typeInto(input, "s");
    expect(input.value).toBe("s");
    typeInto(input, "so");
    expect(input.value).toBe("so");
    // Sem o fix, o re-render do pai (onClose inline nova) re-rodava o efeito
    // e o foco voltava ao div do diálogo após a primeira tecla.
    expect(document.activeElement).toBe(input);
  });

  it("Escape segue chamando o onClose atual mesmo após re-render do pai", async () => {
    const onClose = vi.fn();
    await mount(<Harness onClose={onClose} />);
    typeInto(reasonInput(), "motivo"); // re-renders com novas arrows onClose
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("fechado (open=false) não monta nada nem escuta Escape", async () => {
    const onClose = vi.fn();
    await mount(<AdminConfirm open={false} title="T" lines={[]} consequence="c" confirmLabel="ok" onConfirm={() => undefined} onClose={onClose} />);
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
