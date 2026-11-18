/*
 * Open dialogs, as a stack (last = on top).
 * Dialog components are registered by type in components/dialogs/DialogHost.jsx.
 */
import { create } from "zustand";

let seq = 0;

export const useDialogStore = create(() => ({ dialogs: [] }));

/**
 * Opens a dialog. Opening a type that is already open replaces it (fresh state, moved on top).
 * Returns the dialog id.
 */
export function openDialog(type, props = {}) {
  seq += 1;
  const id = `${type}-${seq}`;
  useDialogStore.setState((state) => ({ dialogs: [...state.dialogs.filter((dialog) => dialog.type !== type), { id, type, props, busy: false }] }));
  return id;
}

export const closeDialog = (id) => useDialogStore.setState((state) => ({ dialogs: state.dialogs.filter((dialog) => dialog.id !== id) }));

export const closeDialogType = (...types) => useDialogStore.setState((state) => ({ dialogs: state.dialogs.filter((dialog) => !types.includes(dialog.type)) }));

export const closeAllDialogs = (keepTypes = []) => useDialogStore.setState((state) => ({ dialogs: state.dialogs.filter((dialog) => keepTypes.includes(dialog.type)) }));

export const isDialogOpen = (type) => useDialogStore.getState().dialogs.some((dialog) => dialog.type === type);

export const findDialog = (type) => useDialogStore.getState().dialogs.find((dialog) => dialog.type === type) || null;

/** Marks a dialog as having unsaved edits (idle auto-refresh waits for it). */
export function setDialogBusy(id, busy) {
  useDialogStore.setState((state) => ({ dialogs: state.dialogs.map((dialog) => (dialog.id === id && dialog.busy !== busy ? { ...dialog, busy } : dialog)) }));
}

/** Dialogs that never block the idle refresh unless they say they are busy. */
const PASSIVE_TYPES = ["store", "storeIssues", "links"];

/** True when a form is open, so a background refresh would get in the way. */
export const isAnyFormOpen = () => useDialogStore.getState().dialogs.some((dialog) => dialog.busy || !PASSIVE_TYPES.includes(dialog.type));
